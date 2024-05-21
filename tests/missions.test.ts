import * as web3 from "@solana/web3.js";
import createEdgeClient, {
  Character,
  CharacterModel,
  Currency,
  HolderStatusEnum,
  Mission,
  MissionPool,
  PermissionedCurrencyKindEnum,
  Profile,
  Project,
  RewardKind,
  Transaction,
  Transactions,
  User,
} from "@honeycomb-protocol/edge-client";
import fs from "fs";
import path from "path";
import base58 from "bs58";
import {
  HPL_HIVE_CONTROL_PROGRAM,
  Honeycomb,
  HoneycombProject,
  METADATA_PROGRAM_ID,
  PROGRAM_ID,
  VAULT,
  identityModule,
} from "@honeycomb-protocol/hive-control";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import { createNewTree, mintOneCNFT } from "../utils";
import { TokenStandard } from "@metaplex-foundation/mpl-bubblegum";
import {
  HplCurrency,
  PermissionedCurrencyKind,
} from "@honeycomb-protocol/currency-manager";
import { fetchHeliusAssets } from "@honeycomb-protocol/character-manager";
import { HPL_NECTAR_MISSIONS_PROGRAM } from "@honeycomb-protocol/nectar-missions";
import nacl from "tweetnacl";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import { Client, fetchExchange } from "@urql/core";

jest.setTimeout(200000);

// Load environment variables
require("dotenv").config();

const API_URL = process.env.API_URL ?? "http://localhost:4000/";
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8899";
const DAS_API_URL = process.env.DAS_API_URL ?? RPC_URL;

const connection = new web3.Connection(RPC_URL, "processed");

const client = createEdgeClient(
  new Client({
    url: API_URL,
    exchanges: [fetchExchange],
  })
);

const adminKeypair = web3.Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../keys", "admin.json"), "utf8")
    )
  )
);

const userKeypair = web3.Keypair.fromSecretKey(
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../keys", "user.json"), "utf8")
    )
  )
);

const sendTransaction = async (
  action: string,
  txResponse: Transaction,
  signer?: web3.Keypair
) => {
  const signedTx = web3.VersionedTransaction.deserialize(
    base58.decode(txResponse.transaction)
  );
  signer && signedTx.sign([signer]);

  const { sendBulkTransactions } = await client.sendBulkTransactions({
    txs: [base58.encode(signedTx.serialize())],
    blockhash: txResponse!.blockhash,
    lastValidBlockHeight: txResponse!.lastValidBlockHeight,
    options: {
      skipPreflight: true,
    },
  });

  expect(sendBulkTransactions.length).toBe(1);
  if (sendBulkTransactions[0].status !== "Success") {
    console.log(
      action,
      sendBulkTransactions[0].status,
      sendBulkTransactions[0].signature,
      sendBulkTransactions[0].error
    );
  }
  expect(sendBulkTransactions[0].status).toBe("Success");
};

const sendTransactions = async (
  txResponse: Transactions,
  signer: web3.Keypair,
  action: string
) => {
  const txs = txResponse!.transactions.map((txStr) => {
    const tx = web3.VersionedTransaction.deserialize(base58.decode(txStr));
    tx.sign([signer]);
    return base58.encode(tx.serialize());
  });

  const { sendBulkTransactions } = await client.sendBulkTransactions({
    txs,
    blockhash: txResponse!.blockhash,
    lastValidBlockHeight: txResponse!.lastValidBlockHeight,
    options: {
      skipPreflight: true,
    },
  });

  expect(sendBulkTransactions.length).toBe(txs.length);
  sendBulkTransactions.forEach((txResponse) => {
    if (txResponse.status !== "Success") {
      console.log(action, txResponse.signature, txResponse.error);
    }
    expect(txResponse.status).toBe("Success");
  });
};

const totalNfts = 5;
const totalcNfts = 0;

describe("Nectar Missions", () => {
  let projectAddress: web3.PublicKey;
  let project: HoneycombProject;
  let cProject: Project;
  let user: User;
  let profile: Profile;
  let accessToken: string;
  let merkleTree: web3.PublicKey;
  let collection: web3.PublicKey;
  let currencyAddress: web3.PublicKey;
  let currency: HplCurrency;
  let characterModelAddress: web3.PublicKey;
  let characterModel: CharacterModel;
  let missionPoolAddress: string;
  let missionPool: MissionPool;
  let missionAddress: string;
  let lookupTableAddress: string;
  let mission: any;

  beforeAll(async () => {
    const adminHC = new Honeycomb(connection).use(identityModule(adminKeypair));
    const metaplex = new Metaplex(connection);
    metaplex.use(keypairIdentity(adminKeypair));

    // Mint Collection
    if (!collection && (totalNfts > 0 || totalcNfts > 0)) {
      collection = await metaplex
        .nfts()
        .create({
          name: "Collection",
          symbol: "COL",
          sellerFeeBasisPoints: 0,
          uri: "https://api.eboy.dev/",
          isCollection: true,
          collectionIsSized: true,
        })
        .then((x) => x.nft.mint.address);
    }

    console.log("Collection", collection.toString());

    // Mint Nfts
    for (let i = 1; i <= totalNfts; i++) {
      await metaplex
        .nfts()
        .create({
          name: `Sol Patrol #${i}`,
          symbol: `NFT`,
          sellerFeeBasisPoints: 100,
          uri: "https://arweave.net/WhyRt90kgI7f0EG9GPfB8TIBTIBgX3X12QaF9ObFerE",
          collection,
          collectionAuthority: metaplex.identity(),
          tokenStandard: TokenStandard.NonFungible,
          tokenOwner: userKeypair.publicKey,
        })
        .then((x) => x.nft);
    }

    // Mint cNFTs
    for (let i = 1; i <= totalcNfts; i++) {
      if (i === 1 && !merkleTree) {
        [merkleTree] = await createNewTree(connection, adminKeypair);
      }

      await mintOneCNFT(connection, adminKeypair, {
        dropWalletKey: userKeypair.publicKey,
        name: `cNFT #${i}`,
        symbol: "cNFT",
        uri: "https://arweave.net/WhyRt90kgI7f0EG9GPfB8TIBTIBgX3X12QaF9ObFerE",
        merkleTree,
        collectionMint: collection,
      });
    }

    // Create Project
    if (!projectAddress) {
      project = await HoneycombProject.new(adminHC, {
        name: "Project",
      });
    } else {
      project = await HoneycombProject.fromAddress(adminHC, projectAddress);
    }
    adminHC.use(project);
    projectAddress = project.address;
    console.log("Project", projectAddress.toString());

    await new Promise((resolve) => setTimeout(resolve, 5000));

    cProject = await client
      .findProjects({
        ids: [projectAddress.toString()],
      })
      .then(({ project: [projectT] }) => projectT);

    // Create Currency
    if (!currencyAddress) {
      currency = await HplCurrency.new(adminHC, {
        name: "BAIL",
        symbol: "BAIL",
        kind: PermissionedCurrencyKind.NonCustodial,
        decimals: 9,
        uri: "https://arweave.net/1VxSzPEOwYlTo3lU5XSQWj-9Ldt3dB68cynDDjzeF-c",
      });
      currencyAddress = currency.address;

      // Create Holder Account
      adminHC.use(currency);
      await currency.newHolderAccount(userKeypair.publicKey);

      console.log("Minting Currency To User's Wallet");
      (await currency.holderAccount(userKeypair.publicKey)).mint(1000, {
        commitment: "processed",
        skipPreflight: true,
      });
    } else {
      currency = await HplCurrency.fromAddress(adminHC, currencyAddress);
      adminHC.use(currency);
    }
    console.log("Currency", currencyAddress.toString());

    // Create Character Model
    if (!characterModelAddress) {
      const {
        createCreateCharacterModelTransaction: {
          tx: txResponse,
          characterModel: characterModelAddressT,
        },
      } = await client.createCreateCharacterModelTransaction({
        config: {
          kind: "Wrapped",
          criterias: [
            {
              kind: "Collection",
              params: collection.toString(),
            },
            ...(merkleTree
              ? [
                  {
                    kind: "MerkleTree",
                    params: merkleTree.toString(),
                  },
                ]
              : []),
          ],
        },
        project: projectAddress.toString(),
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });
      characterModelAddress = new web3.PublicKey(characterModelAddressT);

      await sendTransaction(
        "createCreateCharacterModelTransaction",
        {
          transaction: txResponse.transaction,
          blockhash: txResponse.blockhash,
          lastValidBlockHeight: txResponse.lastValidBlockHeight,
        },
        adminKeypair
      );

      console.log("Character Model", characterModelAddress.toString());
      await new Promise((resolve) => setTimeout(resolve, 6000));
    }

    characterModel = await client
      .findCharacterModels({
        ids: [characterModelAddress.toString()],
      })
      .then((res) => res.characterModel[0]);

    expect(characterModel).toBeTruthy();

    // Create Characters Tree
    if (
      !characterModel.merkle_trees.merkle_trees[
        characterModel.merkle_trees.active
      ]
    ) {
      const { createCreateCharactersTreeTransaction: txResponse } =
        await client.createCreateCharactersTreeTransaction({
          treeConfig: {
            maxDepth: 3,
            maxBufferSize: 8,
            canopyDepth: 3,
          },
          project: projectAddress.toString(),
          characterModel: characterModelAddress.toString(),
          authority: adminKeypair.publicKey.toString(),
          payer: adminKeypair.publicKey.toString(),
        });

      await sendTransaction(
        "createCreateCharactersTreeTransaction",
        txResponse,
        adminKeypair
      );

      await new Promise((resolve) => setTimeout(resolve, 10000));
      characterModel = await client
        .findCharacterModels({
          ids: [characterModelAddress.toString()],
        })
        .then((res) => res.characterModel[0]);

      // Wrap Assets
      const assets = await fetchHeliusAssets(DAS_API_URL, {
        walletAddress: userKeypair.publicKey,
        collectionAddress: collection,
      }).then((assets) => assets.filter((n) => !n.frozen).slice(0, 5));

      if (!assets.length) throw new Error("No Assets to wrap");

      const { createWrapAssetsToCharacterTransactions: txResponse2 } =
        await client.createWrapAssetsToCharacterTransactions({
          project: projectAddress.toString(),
          characterModel: characterModelAddress.toString(),
          wallet: userKeypair.publicKey.toString(),
          mintList: assets.map((n) => n.mint.toString()),
          activeCharactersMerkleTree:
            characterModel.merkle_trees.merkle_trees[
              characterModel.merkle_trees.active
            ].toString(),
        });

      const txs = txResponse2!.transactions.map((txStr) => {
        const tx = web3.VersionedTransaction.deserialize(base58.decode(txStr));
        tx.sign([userKeypair]);
        return base58.encode(tx.serialize());
      });

      await sendTransactions(
        txResponse2,
        userKeypair,
        "createWrapAssetsToCharacterTransactions"
      );
    }

    /// PROFILE PART
    const userInfo = {
      username: "hcDev",
      name: "Honeycomb Developer",
      bio: "This user is created for testing purposes",
      pfp: "https://lh3.googleusercontent.com/-Jsm7S8BHy4nOzrw2f5AryUgp9Fym2buUOkkxgNplGCddTkiKBXPLRytTMXBXwGcHuRr06EvJStmkHj-9JeTfmHsnT0prHg5Mhg",
    };

    const profileInfo = {
      name: `(Profile) ${userInfo.name}`,
      bio: `This is profile of ${userInfo.username}`,
      pfp: "https://lh3.googleusercontent.com/-Jsm7S8BHy4nOzrw2f5AryUgp9Fym2buUOkkxgNplGCddTkiKBXPLRytTMXBXwGcHuRr06EvJStmkHj-9JeTfmHsnT0prHg5Mhg",
    };

    await Promise.resolve(
      setTimeout(
        () => {},
        3000 // 3 seconds
      )
    );

    if (!cProject.profileTrees.merkle_trees[cProject.profileTrees.active]) {
      console.log("Creating Profile Tree");
      const { createCreateProfilesTreeTransaction: txResponse } =
        await client.createCreateProfilesTreeTransaction({
          treeConfig: {
            maxDepth: 14,
            maxBufferSize: 64,
            canopyDepth: 13,
          },
          project: cProject.id,
          authority: adminKeypair.publicKey.toString(),
        });

      await sendTransaction(
        "createCreateProfilesTreeTransaction",
        txResponse,
        adminKeypair
      );

      await client
        .findProjects({
          ids: [cProject.id],
        })
        .then(({ project: [projectT] }) => (cProject = projectT));
    }

    expect(
      cProject.profileTrees.merkle_trees[cProject.profileTrees.active]
    ).toBeTruthy();

    await Promise.resolve(
      setTimeout(
        () => {},
        3000 // 3 seconds
      )
    );

    await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [userT] }) => (user = userT));

    if (!user) {
      console.log("Creating User WIth Profile");
      const { createNewUserWithProfileTransaction: txResponse } =
        await client.createNewUserWithProfileTransaction({
          userInfo,
          profileInfo,
          wallet: userKeypair.publicKey.toString(),
          project: cProject.id,
        });

      await sendTransaction("createNewUserWithProfileTransaction", txResponse);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [userT] }) => (user = userT));

    const { authRequest } = await client.authRequest({
      wallet: userKeypair.publicKey.toString(),
    });

    const message = new TextEncoder().encode(authRequest);
    const sig = nacl.sign.detached(message, userKeypair.secretKey);
    const signature = base58.encode(sig);
    await client
      .authConfirm({
        wallet: userKeypair.publicKey.toString(),
        signature,
      })
      .then(
        ({ authConfirm: { accessToken: accessTokenT } }) =>
          (accessToken = accessTokenT)
      );

    expect(user).toBeTruthy();
    // expect(user.info.username).toBe(userInfo.username);
    expect(user.info.name).toBe(userInfo.name);
    expect(user.info.bio).toBe(userInfo.bio);
    expect(user.info.pfp).toBe(userInfo.pfp);

    await client
      .findProfiles({
        userIds: [user.id],
        projects: [projectAddress.toString()],
        includeProof: true,
      })
      .then(({ profile: [profileT] }) => (profile = profileT));

    if (!profile) {
      console.log("Creating Profile");
      const { createNewProfileTransaction: txResponse } =
        await client.createNewProfileTransaction(
          {
            project: cProject.id,
            info: profileInfo,
          },
          {
            fetchOptions: {
              headers: {
                authorization: `Bearer ${accessToken}`,
              },
            },
          }
        );

      await sendTransaction("createNewProfileTransaction", txResponse);

      await new Promise((resolve) => setTimeout(resolve, 10000));

      await client
        .findProfiles({
          userIds: [user.id],
          projects: [projectAddress.toString()],
          includeProof: true,
        })
        .then(({ profile: [profileT] }) => (profile = profileT));
    }

    console.log("Profile Id", profile.id);

    expect(profile).toBeTruthy();
    expect(profile.info.name).toBe(profileInfo.name);
    expect(profile.info.bio).toBe(profileInfo.bio);
    expect(profile.info.pfp).toBe(profileInfo.pfp);
  });

  it("Creates/Loads Mission Pool", async () => {
    if (!projectAddress)
      throw new Error(
        "Project is not created, a valid project is needed to create a Mission Pool"
      );

    if (!characterModelAddress)
      throw new Error(
        "Character Model is not created, a valid character model is needed to create a Mission Pool"
      );

    if (!missionPoolAddress) {
      const {
        createCreateMissionPoolTransaction: {
          missionPoolAddress: missionPoolAddressT,
          tx,
        },
      } = await client.createCreateMissionPoolTransaction({
        data: {
          name: "Test Mission Pool",
          project: project.address.toString(),
          payer: adminKeypair.publicKey.toString(),
          authority: adminKeypair.publicKey.toString(),
          characterModel: characterModelAddress.toString(),
        },
      });

      await sendTransaction("newMissionPool", tx, adminKeypair);
      missionPoolAddress = missionPoolAddressT.toString();
      console.log("Mission Pool", missionPoolAddress);

      await Promise.resolve(() =>
        setTimeout(
          () => {},
          10000 // 10 seconds
        )
      );
    }

    missionPool = await client
      .findMissionPools({ ids: [missionPoolAddress] })
      .then((res) => res.missionPool[0]);

    expect(missionPool).toBeTruthy();
  });

  it("Create Mission", async () => {
    if (!projectAddress)
      throw new Error(
        "Project not created, a valid project is needed to create a Mission"
      );
    if (!missionPoolAddress)
      throw new Error(
        "Mission Pool not created, a valid mission pool is needed to create a Mission"
      );

    if (!missionAddress) {
      const {
        createCreateMissionTransaction: { tx, missionAddress: missionAddressT },
      } = await client.createCreateMissionTransaction({
        data: {
          project: project.address.toString(),
          name: "Test mission 2",
          cost: {
            address: String(currencyAddress),
            amount: "10000000000", // 10B
          },
          duration: "10", // 10 seconds
          minXp: "0",
          rewards: [
            {
              kind: RewardKind.Xp,
              max: "100",
              min: "100",
            },
            {
              kind: RewardKind.Currency,
              max: "50000000000", // 50B
              min: "50000000000", // 50B
              currency: currencyAddress.toString(),
            }
          ],
          missionPool: missionPoolAddress,
          authority: adminKeypair.publicKey.toString(),
          payer: adminKeypair.publicKey.toString(),
        },
      });

      await sendTransaction("createCreateMissionTransaction", tx, adminKeypair);
      missionAddress = missionAddressT.toString();
      console.log("missionAddress", missionAddress);
    }

    mission = await client
      .findMissions({ ids: [missionAddress] })
      .then((res) => res.mission[0]);

    console.log("Mission details");
    console.dir(mission, { depth: 10 });

    expect(missionAddress).toBeTruthy();
  });

  it("Create/Load Lut Address", async () => {
    if (!projectAddress) throw new Error("Project not found");

    if (!lookupTableAddress) {
      const slot = await connection.getSlot();
      const [lookupTableInstruction, lookupTableAddressPub] =
        web3.AddressLookupTableProgram.createLookupTable({
          authority: adminKeypair.publicKey,
          payer: adminKeypair.publicKey,
          recentSlot: slot,
        });

      const extendLutInstruction =
        web3.AddressLookupTableProgram.extendLookupTable({
          addresses: [
            projectAddress,
            currencyAddress,
            characterModelAddress,
            new web3.PublicKey(missionPoolAddress),
            new web3.PublicKey(missionAddress),
            TOKEN_PROGRAM_ID,
            METADATA_PROGRAM_ID,
            SPL_NOOP_PROGRAM_ID,
            SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
            web3.SYSVAR_CLOCK_PUBKEY,
            HPL_NECTAR_MISSIONS_PROGRAM,
            web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            web3.SystemProgram.programId,
            HPL_HIVE_CONTROL_PROGRAM,
            VAULT,
          ],
          lookupTable: lookupTableAddressPub,
          payer: adminKeypair.publicKey,
          authority: adminKeypair.publicKey,
        });

      const txn = new web3.Transaction().add(
        lookupTableInstruction,
        extendLutInstruction
      );

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      txn.recentBlockhash = blockhash;
      txn.lastValidBlockHeight = lastValidBlockHeight;
      txn.feePayer = adminKeypair.publicKey;
      txn.sign(adminKeypair);

      sendTransaction("Create Lookup Table", {
        transaction: base58.encode(txn.serialize()),
        blockhash,
        lastValidBlockHeight,
      });

      console.log("Lookup Table Address", lookupTableAddressPub.toString());
      lookupTableAddress = lookupTableAddressPub.toString();
    }

    expect(lookupTableAddress).toBeTruthy();
  });

  const characterOnMission: Character[] = [];
  it("Participate in Mission", async () => {
    if (!projectAddress)
      throw new Error(
        "Project not created, a valid project is needed to participate in a Mission"
      );
    if (!missionAddress)
      throw new Error(
        "Mission not created, a valid mission is needed to participate in a Mission"
      );

    const { character: characters } = await client.findCharacters({
      wallets: [userKeypair.publicKey.toString()],
      trees: characterModel.merkle_trees.merkle_trees,
    });

    characterOnMission.push(characters[0]);
    console.log("Character when participating:", characters[0].id);
    const {
      createSendCharactersOnMissionTransaction: {
        blockhash,
        lastValidBlockHeight,
        transactions,
      },
    } = await client.createSendCharactersOnMissionTransaction({
      data: {
        mission: missionAddress,
        characterIds: characterOnMission.map((n) => n.id),
        authority: userKeypair.publicKey.toString(),
      },
    });

    await transactions.map((tx, i) =>
      sendTransaction(
        "createSendCharactersOnMissionTransaction" + i,
        {
          transaction: tx,
          blockhash,
          lastValidBlockHeight,
        },
        userKeypair
      )
    );
  });

  it("Recall/Collect Rewards", async () => {
    if (!projectAddress)
      throw new Error(
        "Project not created, a valid project is needed to claim a Mission"
      );
    if (!missionAddress)
      throw new Error(
        "Mission not created, a valid mission is needed to claim a Mission"
      );

    // const { character: characters } = await client.findCharacters({
    //   ids: 2386,
    // });

    // characterOnMission.push(characters[0]);
    // 30 seconds, to wait for mission's end
    await Promise.resolve(() => setTimeout(() => {}, 30000)); 

    console.log("Character when recalling:", characterOnMission[0].id);
    const {
      createRecallCharactersTransaction: {
        transactions,
        blockhash,
        lastValidBlockHeight,
      },
    } = await client.createRecallCharactersTransaction({
      data: {
        mission: missionAddress,
        characterIds: characterOnMission.map((n) => n.id),
        authority: userKeypair.publicKey.toString(),
        collectRewards: true,
      },
      lutAddresses: [lookupTableAddress],
    });

    for (let i = 0; i < transactions.length; i++) {
      await sendTransaction(
        "createRecallCharactersTransaction" + i,
        {
          transaction: transactions[i],
          blockhash,
          lastValidBlockHeight,
        },
        userKeypair
      );
    }
  });
});
