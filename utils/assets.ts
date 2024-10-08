import { createCollection, createV1 } from "@metaplex-foundation/mpl-core";
import {
  createNft,
  createProgrammableNft,
  findMetadataPda,
  verifyCollectionV1,
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
import { adminKeypair as adminKP, errorLog, userKeypair } from ".";
import { create2022Group, mintOne2022Nft } from ".";
import {
  Asset,
  createNewTree,
  fetchHeliusAssets,
  mintOneCNFT,
} from ".";

export interface CollectionWithItems<Mint = PublicKey, Pubkey = PublicKey> {
  group: Pubkey;
  mints: Mint[];
  asset: "MPL_CORE" | "MPL_TM" | "MPL_BG" | "TOKEN_2022";
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
  }

  for (let i in assetSigners) {
    await createProgrammableNft(umi, {
      mint: assetSigners[i],
      uri: "https://arweave.net/WhyRt90kgI7f0EG9GPfB8TIBTIBgX3X12QaF9ObFerE",
      name: `Test Nft Mpl TM ${i}`,
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

export const mintToken2022Collection = async (
  connection: web3.Connection,
  adminKeypair: web3.Keypair,
  itemCount: number | undefined = undefined,
  beneficiery: web3.PublicKey = userKeypair.publicKey,
  group?: {
    groupAddress: web3.PublicKey;
    updateAuthority: web3.Signer;
  },
  options: TransactionBuilderSendAndConfirmOptions = {
    confirm: {
      commitment: "finalized",
    },
  }
) => {
  if (!itemCount) return undefined;

  if (!group) {
    const { mint } = await create2022Group(
      {
        name: "Extensions Group",
        symbol: "Extensions",
        uri: "https://example.com/my-collection.json",
        maxSize: itemCount,
      },
      connection,
      adminKeypair.publicKey,
      adminKeypair,
      adminKeypair,
      undefined,
      options
    );
    group = {
      groupAddress: mint.publicKey,
      updateAuthority: adminKeypair,
    };
  }

  const collectionWithMints: CollectionWithItems<web3.PublicKey> = {
    group: group.groupAddress.toString() as any,
    mints: [],
    asset: "TOKEN_2022",
  };

  for (let i = 0; i < itemCount; i++) {
    const { mint } = await mintOne2022Nft(
      {
        name: `Extensions #${i}`,
        symbol: "Extensions",
        uri: "https://arweave.net/WhyRt90kgI7f0EG9GPfB8TIBTIBgX3X12QaF9ObFerE",
      },
      connection,
      beneficiery,
      adminKeypair,
      adminKeypair,
      undefined,
      group,
      options
    );
    collectionWithMints.mints.push(mint.publicKey);
  }

  return collectionWithMints;
};

export type AssetCounts = {
  core?: number;
  pnfts?: number;
  cnfts?: number;
  token22?: number;
};
export type AssetResponse = {
  core?: CollectionWithItems;
  pnfts?: CollectionWithItems;
  cnfts?: CollectionWithItems<Asset>;
  token22?: CollectionWithItems<web3.PublicKey>;
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
  [response.core, response.pnfts, response.token22] = await Promise.all([
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
    mintToken2022Collection(
      connection,
      adminKeypair,
      count.token22,
      new web3.PublicKey(beneficiery),
      undefined,
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

interface TraitsInput {
  [category: string]: {
    [itemName: string]: string;
  };
}

interface TraitsOutput {
  label: string;
  name: string;
  uri: string;
}

export function transformTraitsData(inputData: TraitsInput): TraitsOutput[] {
  const result: TraitsOutput[] = [];

  for (const [label, items] of Object.entries(inputData)) {
    for (const [name, uri] of Object.entries(items)) {
      result.push({ label, name, uri });
    }
  }

  return result;
}