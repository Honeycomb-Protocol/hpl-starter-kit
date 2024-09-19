import * as web3 from "@solana/web3.js";
import fs from "fs";
import path from "path";
import createEdgeClient, { AdvancedTreeConfig, BadgesCondition, Project, Transaction, Transactions } from "@honeycomb-protocol/edge-client";
import {
  sendTransactionsForTests as sendTransactionsT,
  sendTransactionForTests as sendTransactionT,
} from "@honeycomb-protocol/edge-client/client/helpers";
import nacl from "tweetnacl";
import base58 from "bs58";
import { initUmi } from "./umi";
import {
  BundlrClient,
  Honeycomb,
  identityModule,
} from "@honeycomb-protocol/hive-control";
import { ACCESS_TOKEN_DIR, AssetResponse, createAuthorization, readAccessToken } from ".";
import createLibreplexProgram from "./programs/libreplex_fair_launch";
import lockfile from "proper-lockfile";

try {
  jest.setTimeout(200000);
} catch { }

require("dotenv").config();

export function wait(seconds = 2): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export const API_URL = process.env.API_URL ?? "https://edge.eboy.dev/";
export const RPC_URL = process.env.RPC_URL ?? "https://rpc.eboy.dev/";
export const DAS_API_URL = process.env.DAS_API_URL ?? RPC_URL;

export const connection = new web3.Connection(RPC_URL, {
  commitment: "processed",
  wsEndpoint: process.env.RPC_WS_URL || RPC_URL,
});

export const client = createEdgeClient(API_URL, false);

export const sseClient = createEdgeClient(API_URL, true);
export const adminKeypair = web3.Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../keys", "admin.json"), "utf8")
    )
  )
);

export const userKeypair = web3.Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../keys", "user.json"), "utf8")
    )
  )
);
export const umi = initUmi(RPC_URL, adminKeypair);

export const adminHC = new Honeycomb(connection).use(
  identityModule(adminKeypair)
);
export const bundlr = adminHC.storage() as BundlrClient;

export const libreplexFairLaunchProgram = createLibreplexProgram(
  connection,
  adminKeypair
);

export const log = process.env.DEBUG_LOGS == "true" ? console.log : () => { };
export const errorLog = process.env.ERROR_LOGS == "true" ? console.error : () => { };
export const dirLog = process.env.DEBUG_LOGS == "true" ? console.dir : () => { };
export const sendTransaction = async (
  txResponse: Transaction,
  signers: web3.Keypair[],
  action?: string,
  logOnSuccess = false
) => {
  const response = await sendTransactionT(
    sseClient,
    {
      transaction: txResponse.transaction,
      blockhash: txResponse!.blockhash,
      lastValidBlockHeight: txResponse!.lastValidBlockHeight,
    },
    signers,
    {
      skipPreflight: true,
      commitment: "finalized",
    }
  );
  if (logOnSuccess || response.status !== "Success") {
    errorLog(action, response.status, response.signature, response.error);
  }
  expect(response.status).toBe("Success");
  return response;
};

export const authorize = async () => {
  let release;
  try {
    release = await lockfile.lock(ACCESS_TOKEN_DIR, { retries: 60, retryWait: 2000 });
    let { accessToken } = await readAccessToken();
    if (!accessToken) {
      accessToken = await createAuthorization();
    }
    return accessToken;
  } catch (error) {
    console.error("Error during authorization", error);
    throw error;
  } finally {
    if (release) {
      await release();
    }
  }
};

export const sendTransactions = async (
  txResponse: Transactions,
  signer: web3.Keypair[],
  action: string
) => {
  const responses = await sendTransactionsT(
    sseClient,
    txResponse,
    signer,
    {
      skipPreflight: true,
      commitment: "processed",
    },
    (response) => {
      if (response.status !== "Success") {
        errorLog(action, response.signature, response.error);
      }
      expect(response.status).toBe("Success");
    }
  );
  // expect(responses.length).toBe(txResponse.transactions.length);
  await wait(3);
  return responses;
};

export function makeid(length) {
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}

export async function createProject({
  name = "Test Project",
  profilesTreeCapacity = 100,
  authority = adminKeypair.publicKey.toString(),
  payer = adminKeypair.publicKey.toString(),
  subsidizeFees = true,
  createBadgingCriteria = true
}: {
  name?: string;
  profilesTreeCapacity?: number;
  authority?: string;
  payer?: string;
  subsidizeFees?: boolean;
  createBadgingCriteria?: boolean;
} = {}) {
  const {
    createCreateProjectTransaction: { project: projectAddress, tx: txResponse },
  } = await client.createCreateProjectTransaction({
    name,
    authority,
    payer,
    subsidizeFees,
  });
  await sendTransaction(
    txResponse,
    [adminKeypair],
    "createCreateProjectTransaction"
  );
  let project = await client
    .findProjects({ addresses: [projectAddress] })
    .then((res) => res.project[0]);
  expect(project).toBeTruthy();

  if (subsidizeFees) {
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    const versionedTx = new web3.VersionedTransaction(
      new web3.TransactionMessage({
        instructions: [
          web3.SystemProgram.transfer({
            fromPubkey: adminKeypair.publicKey,
            toPubkey: new web3.PublicKey(projectAddress),
            lamports: 1_000_000_000,
          }),
        ],
        payerKey: adminKeypair.publicKey,
        recentBlockhash: blockhash,
      }).compileToV0Message([])
    );
    versionedTx.sign([adminKeypair]);
    await sendTransaction(
      {
        transaction: base58.encode(versionedTx.serialize()),
        blockhash,
        lastValidBlockHeight,
      },
      [adminKeypair],
      "fundProjectForSubsidy"
    );
  }

  if (profilesTreeCapacity) {
    const {
      createCreateProfilesTreeTransaction: { tx: txResponse },
    } = await client.createCreateProfilesTreeTransaction({
      treeConfig: {
        basic: {
          numAssets: profilesTreeCapacity,
        },
        // advanced: {
        //   maxDepth: 3,
        //   maxBufferSize: 8,
        //   canopyDepth: 3,
        // },
      },
      project: project.address,
      payer: adminKeypair.publicKey.toString(),
    });
    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createCreateProfilesTreeTransaction"
    );

    project = await client
      .findProjects({
        addresses: [project.address],
      })
      .then(({ project: [project] }) => project);

    expect(
      project.profileTrees.merkle_trees[project.profileTrees.active]
    ).toBeTruthy();
  }

  if (createBadgingCriteria) {
    const { createInitializeBadgeCriteriaTransaction: txResponse } =
      await client.createInitializeBadgeCriteriaTransaction({
        args: {
          authority: adminKeypair.publicKey.toString(),
          projectAddress,
          endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
          startTime: Math.floor(Date.now() / 1000),
          badgeIndex: 0,
          payer: adminKeypair.publicKey.toString(),
          condition: BadgesCondition.Public,
        },
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createInitializeBadgeCriteriaTransaction"
    );

    project = await client
      .findProjects({ addresses: [projectAddress] })
      .then((res) => res.project[0]);
    expect(project.badgeCriteria?.[0]).toBeTruthy();
  }

  return project;
}

export async function createCharacterModel(
  project: Project,
  assets: AssetResponse,
  treeConfig: AdvancedTreeConfig
) {
  const {
    createCreateCharacterModelTransaction: {
      tx: createTx,
      characterModel: characterModelAddress,
    },
  } = await client.createCreateCharacterModelTransaction({
    config: {
      kind: "Wrapped",
      criterias: Object.values(assets).map(({ group, asset }) => ({
        kind: asset == "MPL_BG" ? "MerkleTree" : "Collection",
        params: group.toString(),
      })),
    },
    project: project.address,
    authority: adminKeypair.publicKey.toString(),
    payer: adminKeypair.publicKey.toString(),
  });

  await sendTransaction(
    createTx,
    [adminKeypair],
    "createCreateCharacterModelTransaction"
  );

  const {
    createCreateCharactersTreeTransaction: { tx: createTreeTx },
  } = await client.createCreateCharactersTreeTransaction({
    treeConfig: {
      advanced: treeConfig,
    },
    project: project.address,
    characterModel: characterModelAddress,
    authority: adminKeypair.publicKey.toString(),
    payer: adminKeypair.publicKey.toString(),
  });

  await sendTransaction(
    createTreeTx,
    [adminKeypair],
    "createCreateCharactersTreeTransaction"
  );

  const characterModel = await client
    .findCharacterModels({
      addresses: [characterModelAddress],
    })
    .then((res) => res.characterModel[0]);
  expect(characterModel).toBeTruthy();

  return characterModel;
}
