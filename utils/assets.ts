import { createCollection, createV1 } from "@metaplex-foundation/mpl-core";
import {
  createNft,
  createProgrammableNft,
  verifyCollectionV1,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  percentAmount,
  publicKey,
  PublicKey,
  some,
  TransactionBuilderSendAndConfirmOptions,
  Umi,
} from "@metaplex-foundation/umi";
import * as web3 from "@solana/web3.js";
import {
  Asset,
  createNewTree,
  fetchHeliusAssets,
  mintOneCNFT,
} from ".";
import { log, errorLog, adminKeypair as adminKP } from ".";

export interface CollectionWithItems<Mint = PublicKey, Pubkey = PublicKey> {
  group: Pubkey;
  mints: Mint[];
  asset: "MPL_CORE" | "MPL_TM" | "MPL_BG";
}
export const mintMplCoreCollection = async (
  umi: Umi,
  itemCount: number | undefined = undefined,
  beneficiery: PublicKey = umi.payer.publicKey,
  group?: PublicKey,
  options: TransactionBuilderSendAndConfirmOptions = {
    confirm: {
      commitment: "finalized",
    },
  }
) => {
  if (!itemCount) return undefined;

  const assetSigners = new Array(itemCount)
    .fill("")
    .map(() => generateSigner(umi));

  const collectionWithMints: CollectionWithItems = {
    group: group!,
    mints: [],
    asset: "MPL_CORE",
  };

  if (!group && assetSigners.length) {
    const collectionSigner = generateSigner(umi);

    await createCollection(umi, {
      collection: collectionSigner,
      name: "My Collection",
      uri: "https://example.com/my-collection.json",
    }).sendAndConfirm(umi, options);
    collectionWithMints.group = collectionSigner.publicKey;
    log("collection address mpl Core", collectionWithMints.group);
  }

  for (let i in assetSigners) {
    await createV1(umi, {
      asset: assetSigners[i],
      uri: "https://arweave.net/WhyRt90kgI7f0EG9GPfB8TIBTIBgX3X12QaF9ObFerE",
      name: `Test Nft Mpl Core ${i}`,
      collection: collectionWithMints.group,
      owner: beneficiery,
    }).sendAndConfirm(umi, options);
    collectionWithMints.mints.push(assetSigners[i].publicKey);
  }

  return collectionWithMints;
};
export const mintMplTMCollection = async (
  umi: Umi,
  itemCount: number | undefined = undefined,
  beneficiery: PublicKey = umi.payer.publicKey,
  group?: PublicKey,
  options: TransactionBuilderSendAndConfirmOptions = {
    confirm: {
      commitment: "finalized",
    },
  }
) => {
  if (!itemCount) return undefined;
  const assetSigners = new Array(itemCount)
    .fill("")
    .map(() => generateSigner(umi));

  const collectionWithMints: CollectionWithItems = {
    group: group!,
    mints: [],
    asset: "MPL_TM",
  };

  if (!group && assetSigners.length) {
    const collectionSigner = generateSigner(umi);
    await createNft(umi, {
      mint: collectionSigner,
      name: "My Collection",
      uri: "https://example.com/my-collection.json",
      sellerFeeBasisPoints: percentAmount(5.5), // 5.5%
      isCollection: true,
    }).sendAndConfirm(umi, options);

    collectionWithMints.group = collectionSigner.publicKey;
    log("collection address TM Core", collectionWithMints.group);
  }

  for (let i in assetSigners) {
    await createProgrammableNft(umi, {
      mint: assetSigners[i],
      uri: "https://arweave.net/WhyRt90kgI7f0EG9GPfB8TIBTIBgX3X12QaF9ObFerE",
      name: `Test Nft Mpl Core ${i}`,
      collection: some({
        key: collectionWithMints.group,
        verified: false,
      }),
      sellerFeeBasisPoints: percentAmount(5.5),
      tokenOwner: beneficiery,
    })
      .add(
        verifyCollectionV1(umi, {
          collectionMint: collectionWithMints.group,
          metadata: findMetadataPda(umi, { mint: assetSigners[i].publicKey }),
        })
      )
      .sendAndConfirm(umi);

    collectionWithMints.mints.push(assetSigners[i].publicKey);
  }

  return collectionWithMints;
};
require("dotenv").config();

const RPC_URL = process.env.RPC_URL ?? "https://rpc.eboy.dev/";
const DAS_API_URL = process.env.DAS_API_URL ?? RPC_URL;

export const mintMplBGCollection = async (
  connection: web3.Connection,
  adminKeypair: web3.Keypair,
  itemCount: number | undefined = undefined,
  collectionMint: web3.PublicKey,
  beneficiery: web3.PublicKey = adminKeypair.publicKey,
  group?: web3.PublicKey,
  options: TransactionBuilderSendAndConfirmOptions = {
    confirm: {
      commitment: "finalized",
    },
  }
) => {
  if (!itemCount) return undefined;

  const collectionWithMints: CollectionWithItems<Asset> = {
    group: group?.toString() as any,
    mints: [],
    asset: "MPL_BG",
  };

  if (!group && itemCount) {
    collectionWithMints.group = publicKey(
      (await createNewTree(connection, adminKeypair))[0].toString()
    );

    log("collection address BG Tree", collectionWithMints.group);
  }

  for (let i = 0; i < itemCount; i++) {
    await mintOneCNFT(connection, adminKeypair, {
      dropWalletKey: beneficiery,
      name: `cNFT #${i}`,
      symbol: "cNFT",
      uri: "https://arweave.net/WhyRt90kgI7f0EG9GPfB8TIBTIBgX3X12QaF9ObFerE",
      collectionMint,
      merkleTree: new web3.PublicKey(collectionWithMints.group),
    });
  }
  collectionWithMints.mints = (
    await fetchHeliusAssets(DAS_API_URL, {
      walletAddress: beneficiery,
      collectionAddress: collectionMint,
    })
  ).filter((m) => m.compression);
  return collectionWithMints;
};
export type AssetCounts = {
  core?: number;
  pnfts?: number;
  cnfts?: number;
};
export type AssetResponse = {
  core?: CollectionWithItems;
  pnfts?: CollectionWithItems;
  cnfts?: CollectionWithItems<Asset>;
};
export const mintAssets = async (
  umi: Umi,
  count: AssetCounts,
  beneficiery: PublicKey | any,
  collection?: PublicKey | any,
  coreCollection?: PublicKey | any,
  tree?: PublicKey | any,
  connection: web3.Connection = new web3.Connection(umi.rpc.getEndpoint()),
  adminKeypair: web3.Keypair = adminKP,
  options: TransactionBuilderSendAndConfirmOptions = {
    confirm: {
      commitment: "finalized",
    },
  }
): Promise<AssetResponse> => {
  beneficiery = publicKey(beneficiery.toString());
  if (collection) collection = publicKey(collection.toString());
  if (tree) tree = publicKey(tree.toString());
  const response: AssetResponse = {};
  let resistError = (err) => {
    errorLog(err);
    return undefined;
  };
  [response.core, response.pnfts] = await Promise.all([
    mintMplCoreCollection(
      umi,
      count.core,
      beneficiery,
      coreCollection,
      options
    ).catch(resistError),
    mintMplTMCollection(
      umi,
      count.pnfts,
      beneficiery,
      collection,
      options
    ).catch(resistError),
  ]);
  const c = response.pnfts?.group || collection;
  if (c) {
    response.cnfts = await mintMplBGCollection(
      connection,
      adminKeypair,
      count.cnfts,
      new web3.PublicKey(c),
      new web3.PublicKey(beneficiery)
    ).catch(resistError);
  }
  return response;
};
