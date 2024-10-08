import * as web3 from "@solana/web3.js";
import {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  TokenProgramVersion,
  TokenStandard,
  createCreateTreeInstruction,
  createMintToCollectionV1Instruction,
} from "@metaplex-foundation/mpl-bubblegum";
import { MPL_TOKEN_METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  ValidDepthSizePair,
  getConcurrentMerkleTreeAccountSize,
} from "@solana/spl-account-compression";
import { PublicKey } from "@solana/web3.js";
import { errorLog } from ".";
import type { EdgeClient } from "@honeycomb-protocol/edge-client/client/types";

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(MPL_TOKEN_METADATA_PROGRAM_ID);

export interface HeluisAsset {
  interface: string;
  id: string;
  content: {
    $schema: string;
    json_uri: string;
    files: {
      uri: string;
      cdn_uri: string;
      mime: string;
    }[];
    metadata: {
      name: string;
      symbol: string;
      attributes?: {
        value: string;
        trait_type: string;
      }[];
      description?: string;
      token_standard?: string;
      [key: string]: unknown;
    };
    links: {
      image?: string;
      [key: string]: string | undefined;
    };
  };
  authorities: {
    address: string;
    scopes: string[];
  }[];
  compression: {
    eligible: boolean;
    compressed: boolean;
    data_hash: string;
    creator_hash: string;
    asset_hash: string;
    tree: string;
    seq: number;
    leaf_id: number;
  };
  grouping: {
    group_key: string;
    group_value: string;
  }[];
  royalty: {
    royalty_model: string;
    target: any;
    percent: number;
    basis_points: number;
    primary_sale_happened: boolean;
    locked: boolean;
  };
  creators: {
    address: string;
    share: number;
    verified: boolean;
  }[];
  ownership: {
    frozen: boolean;
    delegated: boolean;
    delegate?: string;
    ownership_model: string;
    owner: string;
  };
  supply?: {
    print_max_supply: number;
    print_current_supply: number;
    edition_nonce: any;
  };
  mutable: boolean;
  burnt: boolean;
}

/**
 * Represents the uri data of an NFT.
 * @category Types
 */
export type JsonMetadata = {
  name?: string;
  symbol?: string;
  description?: string;
  seller_fee_basis_points?: number;
  image?: string;
  external_url?: string;
  attributes?: Array<{
    trait_type?: string;
    value?: string;
    [key: string]: unknown;
  }>;
  properties?: {
    creators?: Array<{
      address?: string;
      share?: number;
      [key: string]: unknown;
    }>;
    files?: Array<{
      type?: string;
      uri?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  collection?: {
    name?: string;
    family?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * Represents the metadata of an NFT.
 * @category Types
 */
export type Asset = {
  mint: web3.PublicKey;
  json?: JsonMetadata | null;
  jsonLoaded: boolean;
  name: string;
  symbol: string;
  uri: string;
  creators: {
    address: web3.PublicKey;
    share: number;
    verified: boolean;
  }[];
  collection?: {
    verified: boolean;
    address: web3.PublicKey;
  } | null;
  frozen: boolean;

  isProgrammableNft?: boolean | null;
  programmableConfig?: { ruleSet: web3.PublicKey } | null;

  compression?: {
    leafId: number;
    dataHash: web3.PublicKey;
    creatorHash: web3.PublicKey;
    assetHash: web3.PublicKey;
    tree: web3.PublicKey;
    proof?: undefined;
  } | null;
  isCompressed: boolean;

  links?: {
    [key: string]: string | undefined;
  } | null;
};

export async function createNewTree(
  connection: web3.Connection,
  signer: web3.Keypair
) {
  const merkleTree = web3.Keypair.generate();

  const [treeAuthority, _bump] = web3.PublicKey.findProgramAddressSync(
    [merkleTree.publicKey.toBuffer()],
    BUBBLEGUM_PROGRAM_ID
  );

  const depthSizePair: ValidDepthSizePair = {
    maxDepth: 3,
    maxBufferSize: 8,
  };
  const space = getConcurrentMerkleTreeAccountSize(
    depthSizePair.maxDepth,
    depthSizePair.maxBufferSize
  );

  const tx = new web3.Transaction().add(
    web3.SystemProgram.createAccount({
      newAccountPubkey: merkleTree.publicKey,
      fromPubkey: signer.publicKey,
      space: space,
      lamports: await connection.getMinimumBalanceForRentExemption(space),
      programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    }),
    createCreateTreeInstruction(
      {
        merkleTree: merkleTree.publicKey,
        treeAuthority: treeAuthority,
        payer: signer.publicKey,
        treeCreator: signer.publicKey,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
      },
      {
        maxDepth: depthSizePair.maxDepth,
        maxBufferSize: depthSizePair.maxBufferSize,
        public: false,
      }
    )
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = signer.publicKey;

  tx.sign(merkleTree, signer);

  const signature = await connection.sendRawTransaction(tx.serialize());

  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  });

  return [merkleTree.publicKey, signature] as [web3.PublicKey, string];
}

export async function mintOneCNFT(
  connection: web3.Connection,
  signer: web3.Keypair,
  {
    dropWalletKey,
    name,
    symbol,
    uri,
    merkleTree,
    collectionMint,
  }: {
    dropWalletKey: web3.PublicKey;
    name: string;
    symbol: string;
    uri: string;
    merkleTree: web3.PublicKey;
    collectionMint: web3.PublicKey;
  }
) {
  try {
    const [treeAuthority, _bump] = web3.PublicKey.findProgramAddressSync(
      [merkleTree.toBuffer()],
      BUBBLEGUM_PROGRAM_ID
    );

    const [collectionMetadataAccount, _b1] =
      web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata", "utf8"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          collectionMint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      );
    const [collectionEditionAccount, _b2] =
      web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata", "utf8"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          collectionMint.toBuffer(),
          Buffer.from("edition", "utf8"),
        ],
        TOKEN_METADATA_PROGRAM_ID
      );
    const [bgumSigner, __] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("collection_cpi", "utf8")],
      BUBBLEGUM_PROGRAM_ID
    );

    const tx = new web3.Transaction().add(
      createMintToCollectionV1Instruction(
        {
          treeAuthority: treeAuthority,
          leafOwner: dropWalletKey,
          leafDelegate: dropWalletKey,
          merkleTree,
          payer: signer.publicKey,
          treeDelegate: signer.publicKey,
          logWrapper: SPL_NOOP_PROGRAM_ID,
          compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          collectionAuthority: signer.publicKey,
          collectionAuthorityRecordPda: BUBBLEGUM_PROGRAM_ID,
          collectionMint: collectionMint,
          collectionMetadata: collectionMetadataAccount,
          editionAccount: collectionEditionAccount,
          bubblegumSigner: bgumSigner,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        },
        {
          metadataArgs: {
            collection: { key: collectionMint, verified: false },
            creators: [
              {
                address: signer.publicKey,
                verified: false,
                share: 100,
              },
            ],
            isMutable: true,
            name,
            primarySaleHappened: true,
            sellerFeeBasisPoints: 500,
            symbol,
            uri,
            uses: null,
            tokenStandard: TokenStandard.NonFungible,
            editionNonce: null,
            tokenProgramVersion: TokenProgramVersion.Original,
          },
        }
      )
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();

    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = signer.publicKey;

    tx.sign(signer);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
    });

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    return {
      txHash: signature,
      wallet: dropWalletKey,
      name,
      error: false,
      message: "Success",
    };
  } catch (e) {
    throw new Error(e);
  }
}

export async function fetchHeliusAssets(
  heliusRpc: string,
  args:
    | {
        walletAddress: web3.PublicKey;
        collectionAddress: web3.PublicKey;
      }
    | { mintList: web3.PublicKey[] }
) {
  if ("mintList" in args) {
    try {
      return await fetch(heliusRpc, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "my-id",
          method: "getAssetBatch",
          params: {
            ids: args.mintList,
          },
        }),
      })
        .then((r) => r.json())
        .then(
          ({ result }) =>
            result.filter((x) => !!x).map(parseHeliusAsset) as Asset[]
        );
    } catch (e) {
      errorLog(e);
      errorLog(e.response.data);
      return [];
    }
  }

  let page: number = 1;
  let assetList: any = [];
  while (page > 0) {
    try {
      const { result, ...rest } = await fetch(heliusRpc, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Math.random().toString(36).substring(7),
          method: "searchAssets",
          params: {
            ownerAddress: args.walletAddress.toString(),
            grouping: ["collection", args.collectionAddress.toString()],
            page: page,
            limit: 1000,
          },
        }),
      }).then((r) => r.json());
      assetList.push(...result.items);
      if (result.total !== 1000) {
        page = 0;
      } else {
        page++;
      }
    } catch (e) {
      errorLog(e);
      errorLog(e.response.data);
      break;
    }
  }
  return assetList.map(parseHeliusAsset) as Asset[];
}

export const parseHeliusAsset = (asset: HeluisAsset): Asset => {
  let collection: any = null;
  const foundCollection = asset.grouping.find(
    (g) => g.group_key === "collection"
  );
  if (foundCollection) {
    collection = {
      verified: true,
      address: new web3.PublicKey(
        asset.grouping.find((g) => g.group_key === "collection")!.group_value
      ),
    };
  }
  return {
    mint: new web3.PublicKey(asset.id),
    json: null,
    jsonLoaded: false,
    name: asset.content.metadata.name,
    symbol: asset.content.metadata.symbol,
    uri: asset.content.json_uri,
    creators: asset.creators.map((creator) => ({
      ...creator,
      address: new web3.PublicKey(creator.address),
    })),
    collection,
    isProgrammableNft:
      asset.content?.metadata?.token_standard == "ProgrammableNonFungible" ||
      asset.interface === "ProgrammableNFT",
    programmableConfig: {
      ruleSet: new web3.PublicKey(
        "eBJLFYPxJmMGKuFwpDWkzxZeUrad92kZRC5BJLpzyT9"
      ),
    },
    isCompressed: asset.compression.compressed,
    frozen: asset.ownership.delegated || !!asset.ownership.delegate,
    compression: !asset.compression.compressed
      ? null
      : {
          leafId: asset.compression.leaf_id,
          dataHash: new web3.PublicKey(asset.compression.data_hash),
          creatorHash: new web3.PublicKey(asset.compression.creator_hash),
          assetHash: new web3.PublicKey(asset.compression.asset_hash),
          tree: new web3.PublicKey(asset.compression.tree),
        },
    links: asset.content.links,
  };
};

// export const addBulkTraits = async (client: EdgeClient, traits: Trait[]) => {

// }