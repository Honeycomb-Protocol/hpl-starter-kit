import * as web3 from "@solana/web3.js";
import fs from "fs";
import path from "path";
import createEdgeClient, { Transaction, Transactions } from "@honeycomb-protocol/edge-client";
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

try {
  jest.setTimeout(200000);
} catch {}

require("dotenv").config();

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
export const log = process.env.NO_LOG == "true" ? () => {} : console.log;
export const errorLog = process.env.NO_LOG == "true" ? () => {} : console.error;
export const dirLog = process.env.NO_LOG == "true" ? () => {} : console.dir;
export const sendTransaction = async (
  txResponse: Transaction,
  signers: web3.Keypair[],
  action?: string
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
  if (response.status !== "Success") {
    log(action, response.status, response.signature, response.error);
  }
  expect(response.status).toBe("Success");
  return response;
};
export const authorize = async (keypair = userKeypair) => {
  const {
    authRequest: { message: authRequest },
  } = await client.authRequest({
    wallet: keypair.publicKey.toString(),
  });
  const message = new TextEncoder().encode(authRequest);
  const sig = nacl.sign.detached(message, keypair.secretKey);
  const signature = base58.encode(sig);
  return client
    .authConfirm({
      wallet: keypair.publicKey.toString(),
      signature,
    })
    .then(({ authConfirm: { accessToken } }) => accessToken);
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
      commitment: "finalized",
    },
    (response) => {
      if (response.status !== "Success") {
        log(action, response.signature, response.error);
      }
      expect(response.status).toBe("Success");
    }
  );
  // expect(responses.length).toBe(txResponse.transactions.length);
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
