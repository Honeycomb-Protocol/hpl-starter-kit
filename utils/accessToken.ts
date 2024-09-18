import * as web3 from "@solana/web3.js";
import nacl from "tweetnacl";
import { client, userKeypair } from "./base";
import base58 from "bs58";
import fs from "fs";
import path from "path";
import { AuthConfirmQuery } from "@honeycomb-protocol/edge-client";

export const ACCESS_TOKEN_DIR = path.resolve(__dirname, "../tests/");
export const ACCESS_TOKEN_PATH = path.join(ACCESS_TOKEN_DIR, "accessToken.json");
export const ACCESS_TOKEN_VALIDITY = 60 * 60 * 20;

const writeAccessToken = (authConfirmData: AuthConfirmQuery["authConfirm"]) => {
    try {
        const data = {
            ...authConfirmData,
            timestamp: Math.ceil(Date.now() / 1000),
        };
        fs.writeFileSync(ACCESS_TOKEN_PATH, JSON.stringify(data));
    } catch (error) {
        console.error("Could not write access token", error);
        throw error;
    }
};

const signAuthRequest = (authRequest: string, keypair: web3.Keypair) => {
    const messageBytes = new TextEncoder().encode(authRequest);
    const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
    return base58.encode(signatureBytes);
};

export const readAccessToken = () => {
    try {
        const { accessToken, timestamp } = JSON.parse(fs.readFileSync(ACCESS_TOKEN_PATH, "utf8"));
        return {accessToken, timestamp};
    } catch (error) {
        if (error.code === "ENOENT") {
            return {
                accessToken: null,
                timestamp: 0,
            };
        }
        console.error("Could not read access token", error);
        throw error;
    }
};

export const createAuthorization = async (keypair = userKeypair) => {
    try {
      const wallet = keypair.publicKey.toString();
      const { authRequest: { message: authRequest } } = await client.authRequest({ wallet });
      const signature = signAuthRequest(authRequest, keypair);
  
      const { authConfirm } = await client.authConfirm({ wallet, signature });
      await writeAccessToken(authConfirm);
  
      return authConfirm.accessToken;
    } catch (error) {
      console.error("Error during authorization creation", error);
      throw error;
    }
  };