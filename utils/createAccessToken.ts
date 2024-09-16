import nacl from "tweetnacl";
import { client, userKeypair } from "./base";
import base58 from "bs58";
import fs from "fs";
import path from "path";

export const createAuthorization = async (keypair = userKeypair) => {
    const {
        authRequest: { message: authRequest },
    } = await client.authRequest({
        wallet: keypair.publicKey.toString(),
    });
    const message = new TextEncoder().encode(authRequest);
    const sig = nacl.sign.detached(message, keypair.secretKey);
    const signature = base58.encode(sig);
    const { authConfirm } = await client
        .authConfirm({
            wallet: keypair.publicKey.toString(),
            signature,
        });
    fs.writeFileSync(path.resolve(__dirname, "../tests/", "accessToken.json"), JSON.stringify(authConfirm));

    return authConfirm.accessToken;
};