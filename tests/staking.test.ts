console.warn = () => { }; // Suppresses console.warn from web3.js

import * as web3 from "@solana/web3.js";
import base58 from "bs58";
import { HPL_CHARACTER_MANAGER_PROGRAM } from "@honeycomb-protocol/character-manager";
import {
  HPL_HIVE_CONTROL_PROGRAM,
  VAULT,
} from "@honeycomb-protocol/hive-control";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  AddMultiplierMetadataInput,
  CharacterModel,
  LockTypeEnum,
  ResourceStorageEnum,
} from "@honeycomb-protocol/edge-client";
import {
  adminKeypair,
  client,
  connection,
  log,
  sendTransaction,
  sendTransactions,
  umi,
  userKeypair,
  wait,
  mintAssets,
  fetchHeliusAssets,
} from "../utils";

const totalNfts = 1;
const totalcNfts = 0;

describe("Test Nectar Staking Txs", () => {
  let collection: web3.PublicKey;
  let merkleTree: web3.PublicKey;
  let projectAddress: string;
  let resourceAddress: string;
  let characterModelAddress: string;
  let stakingPoolAddress: string;
  let multipliersAddress: string;
  let lookupTableAddress: string;
  let characterModel: CharacterModel;

  beforeAll(async () => {
    const mintedAssets = await mintAssets(
      umi,
      {
        cnfts: totalcNfts,
        pnfts: totalNfts,
      },
      userKeypair.publicKey
    );
    if (mintedAssets.cnfts?.group)
      merkleTree = new web3.PublicKey(mintedAssets.cnfts.group);
    if (mintedAssets.pnfts?.group)
      collection = new web3.PublicKey(mintedAssets.pnfts.group);
    log(mintedAssets);

    // Create Project
    if (!projectAddress) {
      const {
        createCreateProjectTransaction: {
          project: projectAddressT,
          tx: txResponse,
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

      projectAddress = projectAddressT;
    }
    log("Project", projectAddress);

    // Create Currency
    if (!resourceAddress) {
      const {
        createCreateNewResourceTransaction: { resource: resourceAddressT, tx },
      } = await client.createCreateNewResourceTransaction({
        authority: adminKeypair.publicKey.toString(),
        project: projectAddress,
        params: {
          decimals: 9,
          name: "Test Resource",
          symbol: "TST",
          uri: "https://qgp7lco5ylyitscysc2c7clhpxipw6sexpc2eij7g5rq3pnkcx2q.arweave.net/gZ_1id3C8InIWJC0L4lnfdD7ekS7xaIhPzdjDb2qFfU",
          storage: ResourceStorageEnum.AccountState,
        },
      });

      await sendTransaction(
        tx,
        [adminKeypair],
        "createInitCurrencyTransaction"
      );
      resourceAddress = resourceAddressT;
    }
    log("Resource", resourceAddress);

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
        project: projectAddress,
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
        cooldown: {
          ejection: 1,
        }
      });
      characterModelAddress = characterModelAddressT;

      await sendTransaction(
        txResponse,
        [adminKeypair],
        "createCreateCharacterModelTransaction"
      );
    }
    log("Character Model", characterModelAddress.toString());

    characterModel = await client
      .findCharacterModels({
        addresses: [characterModelAddress.toString()],
      })
      .then((res) => res.characterModel[0]);
    expect(characterModel).toBeTruthy();

    // Create Characters Tree
    if (
      !characterModel.merkle_trees.merkle_trees[
      characterModel.merkle_trees.active
      ]
    ) {
      const {
        createCreateCharactersTreeTransaction: { tx: txResponse },
      } = await client.createCreateCharactersTreeTransaction({
        treeConfig: {
          advanced: {
            maxDepth: 3,
            maxBufferSize: 8,
            canopyDepth: 3,
          },
        },
        project: projectAddress,
        characterModel: characterModelAddress.toString(),
        authority: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

      await sendTransaction(
        txResponse,
        [adminKeypair],
        "createCreateCharactersTreeTransaction"
      );

      characterModel = await client
        .findCharacterModels({
          addresses: [characterModelAddress.toString()],
        })
        .then((res) => res.characterModel[0]);
    }

    if (totalNfts > 0 || totalcNfts > 0) {
      // Wrap Assets
      const assets = await fetchHeliusAssets({
        walletAddress: userKeypair.publicKey,
        collectionAddress: collection,
      }).then((assets) => assets.filter((n) => !n.frozen).slice(0, 5));

      // if (!assets.length) throw new Error("No Assets to wrap");

      const { createWrapAssetsToCharacterTransactions: txResponse } =
        await client.createWrapAssetsToCharacterTransactions({
          project: projectAddress,
          characterModel: characterModelAddress.toString(),
          wallet: userKeypair.publicKey.toString(),
          mintList: assets.map((n) => n.mint.toString()),
        });

      await sendTransactions(
        txResponse,
        [userKeypair],
        "createWrapAssetsToCharacterTransactions"
      );
    }
  });

  it("Create/Load Staking Pool", async () => {
    if (!projectAddress) throw new Error("Project not created");
    if (!resourceAddress) throw new Error("Currency not created");

    if (!stakingPoolAddress) {
      const {
        createCreateStakingPoolTransaction: {
          transactions: stakingPoolTxns,
          stakingPoolAddress: stakingPoolAddressT,
        },
      } = await client.createCreateStakingPoolTransaction({
        project: projectAddress,
        resource: resourceAddress,
        authority: adminKeypair.publicKey.toString(),
        metadata: {
          name: "Staking",
          rewardsPerDuration: "1",
          rewardsDuration: "1",
          maxRewardsDuration: null,
          minStakeDuration: null,
          cooldownDuration: null,
          resetStakeDuration: false,
          startTime: Date.now().toString(),
          endTime: null,
          lockType: LockTypeEnum.Freeze,
        },
      });

      stakingPoolAddress = stakingPoolAddressT;
      log("Staking Pool", stakingPoolAddress);

      for (let i = 0; i < stakingPoolTxns.transactions.length; i++) {
        await sendTransaction(
          {
            blockhash: stakingPoolTxns.blockhash,
            lastValidBlockHeight: stakingPoolTxns.lastValidBlockHeight,
            transaction: stakingPoolTxns.transactions[i],
          },
          [adminKeypair],
          "createCreateStakingPoolTransaction"
        );
      }
    }

    const pool = await client
      .findStakingPools({
        addresses: [stakingPoolAddress],
      })
      .then((res) => res.stakingPools[0]);

    expect(pool).toBeTruthy();
  });

  it("Update Staking Pool", async () => {
    if (!stakingPoolAddress) throw new Error("Staking Pool not created");

    const { createUpdateStakingPoolTransaction: updatePoolTx } =
      await client.createUpdateStakingPoolTransaction({
        authority: adminKeypair.publicKey.toString(),
        project: projectAddress,
        stakingPool: stakingPoolAddress,
        characterModel: characterModelAddress,
      });

    await sendTransaction(
      updatePoolTx,
      [adminKeypair],
      "createUpdateStakingPoolTransaction"
    );

    const stakingPool = await client
      .findStakingPools({
        addresses: [stakingPoolAddress.toString()],
      })
      .then((res) => res.stakingPools[0]);

    expect(stakingPool).toBeTruthy();
  });

  it("Create/Load Multipliers", async () => {
    if (!projectAddress) throw new Error("Project not created");
    if (!stakingPoolAddress) throw new Error("Staking Pool not created");

    if (!multipliersAddress) {
      const {
        createInitMultipliersTransaction: {
          multipliersAddress: multipliersAddressT,
          tx: initMultiplierTx,
        },
      } = await client.createInitMultipliersTransaction({
        authority: adminKeypair.publicKey.toString(),
        project: projectAddress,
        multipliers: [],
        stakingPool: stakingPoolAddress,
        decimals: 3,
      });

      await sendTransaction(
        initMultiplierTx,
        [adminKeypair],
        "createInitMultipliersTransaction"
      );

      multipliersAddress = multipliersAddressT;
      log("Multipliers", multipliersAddress);
    }

    const multipliers = await client
      .findMultipliers({
        addresses: [multipliersAddress],
      })
      .then((res) => res.multipliers[0]);

    expect(multipliers).toBeTruthy();
  });

  it("Add Multiplier", async () => {
    if (!projectAddress) throw new Error("Project not created");
    if (!stakingPoolAddress) throw new Error("Staking Pool not created");
    if (!multipliersAddress) throw new Error("Multipliers not created");

    const multipliersMetadata: AddMultiplierMetadataInput[] = [
      {
        value: "100", // +0.1x (i.e. 1.1x if 1x)
        type: {
          collection: collection.toBase58(),
        },
      },
      {
        value: "300", // +0.3x (i.e. 1.3x if 1x)
        type: {
          creator: userKeypair.publicKey.toString(),
        },
      },
      {
        value: "300", // +0.3x (i.e. 1.3x if 1x)
        type: {
          minNftCount: "1",
        },
      },
      {
        value: "300", // +0.3x (i.e. 1.3x if 1x)
        type: {
          minStakeDuration: "1",
        },
      },
    ];

    for (const metadata of multipliersMetadata) {
      const { createAddMultiplierTransaction: txResponse } =
        await client.createAddMultiplierTransaction({
          project: projectAddress,
          multiplier: multipliersAddress,
          authority: adminKeypair.publicKey.toString(),
          metadata,
        });

      await sendTransaction(
        txResponse,
        [adminKeypair],
        "createAddMultiplierTransaction"
      );
    }

    const multipliers = await client
      .findMultipliers({
        addresses: [multipliersAddress],
      })
      .then((res) => res.multipliers[0]);

    expect(multipliers).toBeTruthy();
  });

  it("Stake Characters", async () => {
    const { character } = await client.findCharacters({
      filters: {
        owner: userKeypair.publicKey.toString(),
        usedBy: {
          kind: "None",
        },
      },
      trees: characterModel.merkle_trees.merkle_trees.map((x) => x.toString()),
    });

    if (!character?.length) throw new Error("No characters to stake");

    const { createStakeCharactersTransactions: txResponse } =
      await client.createStakeCharactersTransactions({
        characterAddresses: character.map((x) => x!.address),
        project: projectAddress,
        characterModel: characterModelAddress.toString(),
        stakingPool: stakingPoolAddress,
        feePayer: userKeypair.publicKey.toString(),
      });

    await sendTransactions(
      txResponse,
      [userKeypair],
      "createStakeCharactersTransactions"
    );

    const { character: characterRefetch } = await client.findCharacters({
      trees: characterModel.merkle_trees.merkle_trees,
    });
    expect(characterRefetch.length).toBe(character.length);
    characterRefetch.forEach((x) => {
      log(x.address, "Character Address");
      expect(x.usedBy.kind).toBe("Staking");
    });
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
            new web3.PublicKey(characterModelAddress),
            new web3.PublicKey(stakingPoolAddress),
            new web3.PublicKey(resourceAddress),
            VAULT,
            HPL_HIVE_CONTROL_PROGRAM,
            HPL_CHARACTER_MANAGER_PROGRAM,
            web3.SYSVAR_CLOCK_PUBKEY,
            web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
            SPL_NOOP_PROGRAM_ID,
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
        [adminKeypair],
        "createLookupTable"
      );

      log("Lookup Table Address", lookupTableAddressPub.toString());
      lookupTableAddress = lookupTableAddressPub.toString();
      await wait(5);
    }
    expect(lookupTableAddress).toBeTruthy();
  });

  it("UnStake Character", async () => {
    log("Waiting before unstaking");
    await wait(3);

    const { character } = await client.findCharacters({
      filters: {
        owner: userKeypair.publicKey.toString(),
        usedBy: {
          kind: "Staking",
        },
      },
      trees: characterModel.merkle_trees.merkle_trees.map((x) => x.toString()),
    });
    if (!character?.length) throw new Error("No characters to unstake");

    const { createUnstakeCharactersTransactions: txResponse } =
      await client.createUnstakeCharactersTransactions({
        characterAddresses: character.map((x) => x!.address),
        characterModel: characterModelAddress.toString(),
        feePayer: userKeypair.publicKey.toString(),
        lutAddresses: [lookupTableAddress],
      });

    await sendTransactions(
      txResponse,
      [userKeypair],
      "createUnstakeCharactersTransactions"
    );
    
    const { character: characterRefetch } = await client.findCharacters({
      addresses: character.map((x) => x!.address),
    });
    expect(characterRefetch.length).toBe(character.length);
    characterRefetch.forEach((x) => {
      expect(x.usedBy.kind).toBe("None");
    });
  });
});