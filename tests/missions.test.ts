console.warn = () => {}; // Suppresses console.warn from web3.js

import {
  HPL_HIVE_CONTROL_PROGRAM,
  METADATA_PROGRAM_ID,
  VAULT,
} from "@honeycomb-protocol/hive-control";
import { HPL_NECTAR_MISSIONS_PROGRAM } from "@honeycomb-protocol/nectar-missions";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import base58 from "bs58";
import {
  Character,
  CharacterModel,
  MissionPool,
  Profile,
  Project,
  Resource,
  ResourceStorageEnum,
  RewardKind,
  User,
} from "@honeycomb-protocol/edge-client";
import {
  mintAssets,
  adminKeypair,
  authorize,
  client,
  connection,
  sendTransaction,
  sendTransactions,
  umi,
  userKeypair,
  wait,
  fetchHeliusAssets,
  log,
} from "../utils";

const totalNfts = 3;
const totalcNfts = 2;

describe("Nectar Missions", () => {
  let collection: string;
  let projectAddress: string;
  let resourceAddress: string;
  let characterModelAddress: string;
  let missionPoolAddress: string;
  let missionAddress: string;
  let lookupTableAddress: string;

  let project: Project;
  let user: User;
  let profile: Profile;
  let accessToken: string;
  let merkleTree: string;

  let resource: Resource;
  let characterModel: CharacterModel;
  let missionPool: MissionPool;
  let mission: any;

  beforeAll(async () => {
    const mintedAssets = await mintAssets(
      umi,
      {
        cnfts: totalcNfts,
        pnfts: totalNfts,
      },
      userKeypair.publicKey
    );
    if (mintedAssets.cnfts?.group) merkleTree = mintedAssets.cnfts.group;
    if (mintedAssets.pnfts?.group) collection = mintedAssets.pnfts.group;

    // Create Project
    if (!projectAddress) {
      log("Creating Project ....");
      const {
        createCreateProjectTransaction: {
          tx: txResponse,
          project: projectAddressT,
        },
      } = await client.createCreateProjectTransaction({
        name: "Test Project",
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

      await sendTransaction(
        txResponse,
        [adminKeypair],
        "createCreateProjectTransaction"
      );

      log("Project Address", projectAddressT);
      projectAddress = projectAddressT;
    }

    project = await client
      .findProjects({
        addresses: [projectAddress.toString()],
      })
      .then(({ project: [projectT] }) => projectT);

    // Create Resource
    if (!resourceAddress) {
      log("Creating Resource ....");
      const {
        createCreateNewResourceTransaction: {
          tx: initResourceTx,
          resource: resourceAddressT,
        },
      } = await client.createCreateNewResourceTransaction({
        project: projectAddress.toString(),
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
        params: {
          name: "Test Resource",
          symbol: "TC",
          decimals: 6,
          uri: "https://arweave.net/1VxSzPEOwYlTo3lU5XSQWj-9Ldt3dB68cynDDjzeF-c",
          storage: ResourceStorageEnum.AccountState,
        },
      });

      await sendTransaction(
        initResourceTx,
        [adminKeypair],
        "createCreateNewResourceTransaction"
      );
      log("Resource Address", resourceAddressT);
      resourceAddress = resourceAddressT;

      // Mint Resource to User
      const { createMintResourceTransaction: mintResourceTx } =
        await client.createMintResourceTransaction({
          resource: resourceAddress,
          owner: userKeypair.publicKey.toString(),
          authority: adminKeypair.publicKey.toString(),
          amount: String(1000 * 10 ** 6),
        });

      await sendTransaction(
        mintResourceTx,
        [adminKeypair],
        "createCreateNewResourceTransaction"
      );
    }

    resource = await client
      .findResources({
        addresses: [resourceAddress.toString()],
      })
      .then(({ resources }) => resources[0]);

    // Create Character Model
    if (!characterModelAddress) {
      // Create different Character Model
      const {
        createCreateCharacterModelTransaction: {
          tx: txResponse,
          characterModel: newCharacterModelAddressT,
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

      characterModelAddress = newCharacterModelAddressT;

      await sendTransaction(
        {
          transaction: txResponse.transaction,
          blockhash: txResponse.blockhash,
          lastValidBlockHeight: txResponse.lastValidBlockHeight,
        },
        [adminKeypair],
        "createCreateCharacterModelTransaction"
      );
    }

    characterModel = await client
      .findCharacterModels({
        addresses: [characterModelAddress.toString()],
      })
      .then((res) => res.characterModel[0]);

    log("Character Model", characterModelAddress.toString());

    // Create Characters Tree
    if (
      !characterModel.merkle_trees.merkle_trees[
        characterModel.merkle_trees.active
      ]
    ) {
      log("Creating Characters Tree");
      const { createCreateCharactersTreeTransaction: txResponse } =
        await client.createCreateCharactersTreeTransaction({
          treeConfig: {
            advanced: {
              maxDepth: 3,
              maxBufferSize: 8,
              canopyDepth: 1,
            },
          },
          project: projectAddress.toString(),
          characterModel: characterModelAddress.toString(),
          authority: adminKeypair.publicKey.toString(),
          payer: adminKeypair.publicKey.toString(),
        });

      await sendTransaction(
        txResponse.tx,
        [adminKeypair],
        "createCreateCharactersTreeTransaction"
      );

      characterModel = await client
        .findCharacterModels({
          addresses: [characterModelAddress.toString()],
        })
        .then((res) => res.characterModel[0]);

      // Wrap Assets
      const assets = await fetchHeliusAssets({
        walletAddress: userKeypair.publicKey,
        collectionAddress: new web3.PublicKey(collection),
      }).then((assets) => assets.filter((n) => !n.frozen).slice(0, 5));

      log(
        "Assets",
        assets.map((n) => n.mint.toString())
      );
      if (!assets.length) throw new Error("No Assets to wrap");

      log("Wrapping NFTs to Character Models");
      const { createWrapAssetsToCharacterTransactions: txResponse2 } =
        await client.createWrapAssetsToCharacterTransactions({
          project: projectAddress.toString(),
          characterModel: characterModelAddress.toString(),
          wallet: userKeypair.publicKey.toString(),
          mintList: assets.map((n) => n.mint.toString()),
        });

      const txs = txResponse2!.transactions.map((txStr) => {
        const tx = web3.VersionedTransaction.deserialize(base58.decode(txStr));
        tx.sign([userKeypair]);
        return base58.encode(tx.serialize());
      });

      await sendTransactions(
        txResponse2,
        [userKeypair],
        "createWrapAssetsToCharacterTransactions"
      );
    }

    /// PROFILE PART
    const userInfo = {
      username: userKeypair.publicKey.toString(),
      name: "Honeycomb Developer",
      bio: "This user is created for testing purposes",
      pfp: "https://lh3.googleusercontent.com/-Jsm7S8BHy4nOzrw2f5AryUgp9Fym2buUOkkxgNplGCddTkiKBXPLRytTMXBXwGcHuRr06EvJStmkHj-9JeTfmHsnT0prHg5Mhg",
    };

    const profileInfo = {
      name: `(Profile) ${userInfo.username}`,
      bio: `This is profile of ${userInfo.username}`,
      pfp: "https://lh3.googleusercontent.com/-Jsm7S8BHy4nOzrw2f5AryUgp9Fym2buUOkkxgNplGCddTkiKBXPLRytTMXBXwGcHuRr06EvJStmkHj-9JeTfmHsnT0prHg5Mhg",
    };

    // creating profile tree if not exists
    if (!project.profileTrees.merkle_trees[project.profileTrees.active]) {
      log("Creating Profile Tree");
      const {
        createCreateProfilesTreeTransaction: {
          tx: txResponse,
          treeAddress: profilesTreeAddress,
        },
      } = await client.createCreateProfilesTreeTransaction({
        treeConfig: {
          advanced: {
            maxDepth: 3,
            maxBufferSize: 8,
            canopyDepth: 1,
          },
        },
        project: projectAddress.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

      await sendTransaction(
        txResponse,
        [adminKeypair],
        "createCreateProfilesTreeTransaction"
      );

      log("Profile Tree", profilesTreeAddress.toString());
      await client
        .findProjects({
          addresses: [project.address],
        })
        .then(({ project: [projectT] }) => (project = projectT));
    }

    expect(
      project.profileTrees.merkle_trees[project.profileTrees.active]
    ).toBeTruthy();

    await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [userT] }) => (user = userT));

    if (!user) {
      const { createNewUserTransaction: txResponse } =
        await client.createNewUserTransaction({
          info: userInfo,
          wallet: userKeypair.publicKey.toString(),
        });

      await sendTransaction(
        txResponse,
        [userKeypair],
        "createNewUserTransaction"
      );
    }

    user = await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [userT] }) => (user = userT));

    accessToken = await authorize();

    expect(user).toBeTruthy();

    await client
      .findProfiles({
        userIds: [user.id],
        projects: [projectAddress.toString()],
        includeProof: false,
      })
      .then(({ profile: [profileT] }) => {
        profile = profileT;
        return profile;
      });

    if (!profile) {
      log("Creating Profile");
      const { createNewProfileTransaction: txResponse } =
        await client.createNewProfileTransaction(
          {
            project: project.address,
            info: profileInfo,
            payer: userKeypair.publicKey.toString(),
          },
          {
            fetchOptions: {
              headers: {
                authorization: `Bearer ${accessToken}`,
              },
            },
          }
        );

      await sendTransaction(
        txResponse,
        [userKeypair],
        "createNewProfileTransaction"
      );

      await client
        .findProfiles({
          userIds: [user.id],
          projects: [projectAddress.toString()],
          includeProof: true,
        })
        .then(({ profile: [profileT] }) => (profile = profileT));
    }

    log("Profile Id", profile.address);

    expect(profile).toBeTruthy();
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

      await sendTransaction(tx, [adminKeypair], "newMissionPool");
      missionPoolAddress = missionPoolAddressT.toString();
      log("Mission Pool", missionPoolAddress);
    }

    missionPool = await client
      .findMissionPools({ addresses: [missionPoolAddress] })
      .then((res) => res.missionPool[0]);

    expect(missionPool).toBeTruthy();
  });

  it("Updates Mission Pool", async () => {
    if (!projectAddress)
      throw new Error(
        "Project is not created, a valid project is needed to create a Mission Pool"
      );

    if (!missionPoolAddress) {
      throw new Error(
        "Mission Pool not created, a valid mission pool is needed to update a Mission Pool"
      );
    }

    if (!characterModelAddress)
      throw new Error(
        "Character Model is not created, a valid character model is needed to update a Mission Pool"
      );

    const {
      createUpdateMissionPoolTransaction: { tx },
    } = await client.createUpdateMissionPoolTransaction({
      data: {
        project: project.address.toString(),
        missionPool: missionPoolAddress,
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      },
    });

    await sendTransaction(tx, [adminKeypair], "updateMissionPool");

    missionPool = await client
      .findMissionPools({ addresses: [missionPoolAddress] })
      .then((res) => res.missionPool[0]);
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
          name: "Test mission",
          cost: {
            address: String(resource.address),
            amount: String(100 * 10 ** 6),
          },
          duration: "1", // 1 second(s)
          minXp: "0",
          rewards: [
            {
              kind: RewardKind.Xp,
              max: "100",
              min: "100",
            },
            {
              kind: RewardKind.Resource,
              max: String(500 * 10 ** 6),
              min: String(100 * 10 ** 6),
              resource: resource.address,
            },
          ],
          missionPool: missionPoolAddress,
          authority: adminKeypair.publicKey.toString(),
          payer: adminKeypair.publicKey.toString(),
        },
      });

      await sendTransaction(
        tx,
        [adminKeypair],
        "createCreateMissionTransaction"
      );
      missionAddress = missionAddressT;
      log("missionAddress", missionAddress);
    }

    mission = await client
      .findMissions({ addresses: [missionAddress] })
      .then(({ mission }) => mission[0]);

    expect(mission).toBeTruthy();
  });

  it("Update Mission", async () => {
    if (!projectAddress)
      throw new Error(
        "Project not created, a valid project is needed to create a Mission"
      );
    if (!missionPoolAddress)
      throw new Error(
        "Mission Pool not created, a valid mission pool is needed to create a Mission"
      );

    if (missionAddress) {
      const { createUpdateMissionTransaction: txResponse } =
        await client.createUpdateMissionTransaction({
          missionAddress,
          authority: adminKeypair.publicKey.toString(),
          params: {
            newRewards: [],
            updateRewards: [
              {
                kind: RewardKind.Xp,
                max: "300",
                min: "100",
              },
            ],
            removeRewards: [],
            minXp: "0",
            duration: "1",
            cost: {
              amount: "0",
              address: resource.address,
            },
          },
        });

      await sendTransaction(
        txResponse,
        [adminKeypair],
        "createUpdateMissionTransaction"
      );

      mission = await client
        .findMissions({ addresses: [missionAddress] })
        .then((res) => res.mission[0]);

      expect(mission).toBeTruthy();
      expect(mission.rewards).toBeTruthy();
      expect(mission.rewards.length).toBe(2);
    }
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
            new web3.PublicKey(projectAddress),
            new web3.PublicKey(resource.address),
            new web3.PublicKey(resource.mint),
            new web3.PublicKey(characterModelAddress),
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

      sendTransaction(
        {
          transaction: base58.encode(txn.serialize()),
          blockhash,
          lastValidBlockHeight,
        },
        [],
        "Create Lookup Table"
      );

      log("Lookup Table Address", lookupTableAddressPub.toString());
      lookupTableAddress = lookupTableAddressPub.toString();
      await wait(5);
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

    log("Character", characterOnMission[0].address, "Participating");
    if (
      characterOnMission.every(
        (character) => character.usedBy.kind === "Mission"
      )
    ) {
      log("Characters already on mission");
      return;
    }

    log("Character", characterOnMission[0].address, "Participating");
    const {
      createSendCharactersOnMissionTransaction: {
        blockhash,
        lastValidBlockHeight,
        transactions,
      },
    } = await client.createSendCharactersOnMissionTransaction({
      data: {
        mission: missionAddress,
        characterAddresses: [characterOnMission[0].address],
        authority: userKeypair.publicKey.toString(),
        userId: user.id,
      },
      lutAddresses: [lookupTableAddress],
    });

    for (let i = 0; i < transactions.length; i++) {
      await sendTransaction(
        {
          transaction: transactions[i],
          blockhash,
          lastValidBlockHeight,
        },
        [userKeypair],
        "createSendCharactersOnMissionTransaction" + i
      );
    }

    characterOnMission.forEach(async (character) => {
      await client
        .findCharacters({
          addresses: [character.address],
        })
        .then((res) => {
          const character = res.character[0];
          expect(character.usedBy).toBeTruthy();
        });
    });
  });

  it("Collect Rewards + Recall", async () => {
    if (!projectAddress)
      throw new Error(
        "Project not created, a valid project is needed to claim a Mission"
      );
    if (!missionAddress)
      throw new Error(
        "Mission not created, a valid mission is needed to claim a Mission"
      );

    // Wait for mission's end
    log("Waiting for mission to end (Collect Rewards Scenario)");
    await wait(50);

    const {
      createRecallCharactersTransaction: {
        transactions,
        blockhash,
        lastValidBlockHeight,
      },
    } = await client.createRecallCharactersTransaction({
      data: {
        mission: missionAddress,
        characterAddresses: [characterOnMission[0].address],
        authority: userKeypair.publicKey.toString(),
        userId: user.id,
      },
      lutAddresses: [lookupTableAddress],
    });

    for (let i = 0; i < transactions.length; i++) {
      await sendTransaction(
        {
          transaction: transactions[i],
          blockhash,
          lastValidBlockHeight,
        },
        [userKeypair],
        "createRecallCharactersTransaction0 (Collect + Recall)"
      );
    }
  });
});
