import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity as keypairIdentityUmi } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import * as web3 from "@solana/web3.js";

export const initUmi = (rpc: string, authority: web3.Keypair) => {
  return createUmi(rpc)
    .use(mplCore())
    .use(mplTokenMetadata())
    .use(keypairIdentityUmi(fromWeb3JsKeypair(authority), true));
};
