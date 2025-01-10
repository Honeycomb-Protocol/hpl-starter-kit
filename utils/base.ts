import * as web3 from "@solana/web3.js";
import fs from "fs";
import path from "path";
import createEdgeClient, { AdvancedTreeConfig, BadgesCondition, CharacterConfigInput, CharacterTraitInput, MintAsInput, MintAsKind, Project, Transaction, Transactions } from "@honeycomb-protocol/edge-client";
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
import { ASSOCIATED_TOKEN_PROGRAM_ID, AuthorityType, createInitializeMetadataPointerInstruction, createInitializeMintCloseAuthorityInstruction, createInitializeMintInstruction, createInitializePermanentDelegateInstruction, ExtensionType, getMintLen, getOrCreateAssociatedTokenAccount, LENGTH_SIZE, mintTo, setAuthority, TOKEN_2022_PROGRAM_ID, TYPE_SIZE } from "@solana/spl-token";
import { createInitializeInstruction, pack } from "@solana/spl-token-metadata";

try {
  jest.setTimeout(200000);
} catch { }

require("dotenv").config();

export function wait(seconds = 2): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export const API_URL = process.env.API_URL ?? "https://edge.test.honeycombprotocol.com/";
export const RPC_URL = process.env.RPC_URL ?? "https://rpc.test.honeycombprotocol.com/";
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
  action: string,
  flags: {
    expectFail?: boolean;
  } = {}
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
      if (!flags.expectFail && response.status !== "Success") {
        errorLog(action, response.signature, response.error);
      }
      expect(response.status).toBe(flags.expectFail ? "Failed" : "Success");
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

export async function createProject(
  name = "Test Project",
  authority = adminKeypair.publicKey.toString(),
  payer = adminKeypair.publicKey.toString(),
  subsidizeFees = true,
  createProfilesTree = true,
  createBadgingCriteria = true
) {
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

  if (createProfilesTree) {
    const {
      createCreateProfilesTreeTransaction: { tx: txResponse },
    } = await client.createCreateProfilesTreeTransaction({
      treeConfig: {
        advanced: {
          maxDepth: 3,
          maxBufferSize: 8,
          canopyDepth: 3,
        },
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
    // We don't need to check this for now
    // expect(project.badgeCriteria?.[0]).toBeTruthy();
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

export async function createAssemblerConfig(
  project: Project,
  order: string[],
  traits: CharacterTraitInput[]
) {
  const {
    createCreateAssemblerConfigTransaction: {
      tx: txResponse,
      assemblerConfig: assemblerConfigAddress,
      treeAddress: assemblerTreeAddressT,
    },
  } = await client.createCreateAssemblerConfigTransaction({
    treeConfig: {
      // advanced: {
      //   maxDepth: 14,
      //   maxBufferSize: 64,
      //   canopyDepth: 6,
      // },
      basic: {
        numAssets: 100_000,
      },
    },
    ticker: makeid(5),
    order,
    project: project.address,
    authority: adminKeypair.publicKey.toString(),
    payer: adminKeypair.publicKey.toString(),
  });

  await sendTransaction(
    txResponse,
    [adminKeypair],
    "createCreateAssemblerConfigTransaction"
  );

  const assemblerConfig = await client
    .findAssemblerConfig({
      addresses: [assemblerConfigAddress.toString()],
    })
    .then((res) => res.assemblerConfig[0]);
  expect(assemblerConfig).toBeTruthy();

  if (traits.length) {
    const { createAddCharacterTraitsTransactions: txResponse } =
      await client.createAddCharacterTraitsTransactions({
        traits,
        assemblerConfig: assemblerConfig.address,
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransactions(
      txResponse,
      [adminKeypair],
      "createUpdateAssemblerConfigTransaction"
    );

    const characterTraits = await client
      .findCharacterTraits({
        trees: assemblerConfig.merkle_trees.merkle_trees,
      })
      .then((res) => res.characterTrait);

    expect(characterTraits).toBeTruthy();
    expect(characterTraits.length).toBe(traits.length);
  }

  return assemblerConfig;
}

export async function createCharacterModelRaw(
  project: Project,
  config: CharacterConfigInput,
  treeConfig: AdvancedTreeConfig,
  mintAs: MintAsInput = { kind: MintAsKind.MplCore }
) {
  const {
    createCreateCharacterModelTransaction: {
      tx: createTx,
      characterModel: characterModelAddress,
    },
  } = await client.createCreateCharacterModelTransaction({
    config,
    mintAs,
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

export const createTokenExtensionMint = async (
  extensions: ExtensionType[],
  authority: web3.Keypair,
  params: {
    name: string;
    symbol: string;
    uri: string;
  }
) => {
  const mintKeypair = web3.Keypair.generate();
  const metadata = {
    mint: mintKeypair.publicKey,
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    additionalMetadata: [],
  };

  const mintLen = getMintLen(extensions);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const lamports = await connection.getMinimumBalanceForRentExemption(
    mintLen + metadataLen
  );

  const transaction = new web3.Transaction().add(
    web3.SystemProgram.createAccount({
      fromPubkey: adminKeypair.publicKey,
      newAccountPubkey: metadata.mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  );

  // add mint instructions
  if (extensions.includes(ExtensionType.MintCloseAuthority))
    transaction.add(
      createInitializeMintCloseAuthorityInstruction(
        metadata.mint,
        authority.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );

  // add permanent delegate instructions
  if (extensions.includes(ExtensionType.PermanentDelegate))
    transaction.add(
      createInitializePermanentDelegateInstruction(
        metadata.mint,
        authority.publicKey,
        TOKEN_2022_PROGRAM_ID
      )
    );

  // add metadata pointer instructions
  if (extensions.includes(ExtensionType.MetadataPointer))
    transaction.add(
      createInitializeMetadataPointerInstruction(
        metadata.mint,
        authority.publicKey,
        metadata.mint,
        TOKEN_2022_PROGRAM_ID
      )
    );

  // add mint instructions
  transaction.add(
    createInitializeMintInstruction(
      metadata.mint,
      6,
      authority.publicKey,
      authority.publicKey,
      TOKEN_2022_PROGRAM_ID
    )
  );

  // add metadata instructions
  transaction.add(
    createInitializeInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      mint: metadata.mint,
      metadata: metadata.mint,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
      mintAuthority: authority.publicKey,
      updateAuthority: authority.publicKey,
    })
  );

  await web3.sendAndConfirmTransaction(
    connection,
    transaction,
    [adminKeypair, mintKeypair],
    {
      skipPreflight: false,
      commitment: "confirmed",
    }
  );

  return mintKeypair;
};

export const mintTokensAndRevokeMintAuthority = async (mint: web3.PublicKey) => {
  // creating an associated token account
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    mint,
    adminKeypair.publicKey,
    false,
    "confirmed",
    {
      commitment: "confirmed",
      skipPreflight: true,
    },
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // minting tokens into the account
  await mintTo(
    connection,
    adminKeypair,
    mint,
    tokenAccount.address,
    adminKeypair.publicKey,
    1000000 * 10 ** 6,
    [],
    {
      commitment: "confirmed",
      skipPreflight: true,
    },
    TOKEN_2022_PROGRAM_ID
  );

  // revoking permanent delegate authority
  await setAuthority(
    connection,
    adminKeypair,
    mint,
    adminKeypair.publicKey,
    AuthorityType.PermanentDelegate,
    null,
    [],
    {
      commitment: "confirmed",
      skipPreflight: true,
    },
    TOKEN_2022_PROGRAM_ID
  );

  // revoking mint close authority
  await setAuthority(
    connection,
    adminKeypair,
    mint,
    adminKeypair.publicKey,
    AuthorityType.CloseMint,
    null,
    [],
    {
      commitment: "confirmed",
      skipPreflight: true,
    },
    TOKEN_2022_PROGRAM_ID
  );

  // revoking the freeze authority
  await setAuthority(
    connection,
    adminKeypair,
    mint,
    adminKeypair.publicKey,
    AuthorityType.FreezeAccount,
    null,
    [],
    {
      commitment: "confirmed",
      skipPreflight: true,
    },
    TOKEN_2022_PROGRAM_ID
  );
};
