console.warn = () => { }; // Suppresses console.warn from web3.js

import {
  HPL_HIVE_CONTROL_PROGRAM,
  METADATA_PROGRAM_ID,
  VAULT,
} from "@honeycomb-protocol/hive-control";
import { HPL_RESOURCE_MANAGER_PROGRAM } from "@honeycomb-protocol/resource-manager";
import {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AddressLookupTableProgram,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import base58 from "bs58";
import {
  adminKeypair,
  authorize,
  client,
  connection,
  createProject,
  sendTransaction,
  userKeypair,
  log,
  wait,
} from "../../utils";
import {
  ControlledMerkleTrees,
  Profile,
  Project,
  Recipe,
  Resource,
  ResourceStorageEnum,
  User,
} from "@honeycomb-protocol/edge-client";

const getResourceMerkleTree = (resource: Resource) => {
  let merkleTrees: ControlledMerkleTrees | undefined;
  if (
    resource.storage.kind === ResourceStorageEnum.LedgerState &&
    resource.storage.params?.merkle_trees.merkle_trees.length
  ) {
    merkleTrees = resource.storage.params.merkle_trees;
  }

  return merkleTrees;
};

describe("resource fungible token ledger state", () => {
  let projectAddress: string;
  let recipeAddress: string;
  let lutAddress: string;
  let resourcesAddresses: string[] = [];

  let project: Project;
  let user: User;
  let profile: Profile;
  let accessToken: string;

  let resources: Resource[];
  let recipe: Recipe;

  beforeAll(async () => {
    if (!projectAddress) {
      project = await createProject({
        createBadgingCriteria: false,
      });

      log("created project", project.address);
      projectAddress = project.address;
    } else {
      project = await client
        .findProjects({ addresses: [projectAddress] })
        .then(({ project }) => project[0]);
    }

    // create a user
    const userInfo = {
      username: "hcDev" + String(userKeypair.publicKey),
      name: "Honeycomb Developer",
      bio: "This user is created for testing purposes",
      pfp: "n/a",
    };

    const profileInfo = {
      name: `(Profile) ${userInfo.name}`,
      bio: `This is profile of ${userInfo.username}`,
      pfp: "https://lh3.googleusercontent.com/-Jsm7S8BHy4nOzrw2f5AryUgp9Fym2buUOkkxgNplGCddTkiKBXPLRytTMXBXwGcHuRr06EvJStmkHj-9JeTfmHsnT0prHg5Mhg",
    };

    await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [userT] }) => (user = userT));

    if (!user) {
      const { createNewUserTransaction: userTx } =
        await client.createNewUserTransaction({
          info: userInfo,
          payer: adminKeypair.publicKey.toString(),
          wallet: userKeypair.publicKey.toString(),
        });

      await sendTransaction(userTx, [adminKeypair], "createNewUserTransaction");

      await client
        .findUsers({
          wallets: [userKeypair.publicKey.toString()],
        })
        .then(({ user: [userT] }) => (user = userT));
    }
    expect(user).toBeTruthy();

    // access token
    if (!accessToken) accessToken = await authorize(userKeypair);

    await client
      .findProfiles({
        userIds: [user.id],
        projects: [project.address],
      })
      .then(({ profile: [profileT] }) => (profile = profileT));

    // create a profile
    if (!profile) {
      if (!accessToken) throw new Error(`Access token not created`);
      const { createNewProfileTransaction: txResponse } =
        await client.createNewProfileTransaction(
          {
            project: project.address,
            info: profileInfo,
            payer: userKeypair.publicKey.toString(),
          },
          {
            fetchOptions: !accessToken
              ? {}
              : {
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
          projects: [project.address],
        })
        .then(({ profile: [profileT] }) => (profile = profileT));
    }

    expect(profile).toBeTruthy();
    expect(profile.info.name).toBe(profileInfo.name);
    expect(profile.info.bio).toBe(profileInfo.bio);
    expect(profile.info.pfp).toBe(profileInfo.pfp);
  });

  it("create fungible resources", async () => {
    if (!project) throw new Error(`Project not created`);

    const noOfResources = 2;
    if (!resourcesAddresses.length) {
      for (let i = 0; i < noOfResources; i++) {
        const {
          createCreateNewResourceTransaction: { resource, tx },
        } = await client.createCreateNewResourceTransaction({
          project: project.address,
          authority: adminKeypair.publicKey.toString(),
          params: {
            name: "Test resource" + i,
            decimals: 6,
            symbol: "TST" + i,
            uri: "https://example.com",
            storage: ResourceStorageEnum.LedgerState,
          },
        });

        await sendTransaction(
          tx,
          [adminKeypair],
          "createCreateResourceTransaction" + i
        );

        // add the resource to the list
        resourcesAddresses.push(resource);
      }

      log("created resources", resourcesAddresses);
    }

    // load the resources from the client
    await client
      .findResources({
        projects: [project.address],
        addresses: resourcesAddresses,
      })
      .then(({ resources: resourcesT }) => {
        resources = resourcesT;
      });

    expect(resources.length).toBe(noOfResources);
    expect(resources[0].storage.kind).toBe(ResourceStorageEnum.LedgerState);
  });

  it("create resource merkle trees", async () => {
    if (!resources.length) throw new Error(`Resources not created`);

    for (let resource of resources) {
      if (
        resource.storage.kind === ResourceStorageEnum.LedgerState &&
        resource.storage.params?.merkle_trees &&
        resource.storage.params?.merkle_trees.merkle_trees.length > 0
      )
        continue;

      const {
        createCreateNewResourceTreeTransaction: { tx, treeAddress },
      } = await client.createCreateNewResourceTreeTransaction({
        resource: resource.address,
        project: project.address,
        authority: adminKeypair.publicKey.toString(),
        treeConfig: {
          advanced: {
            maxDepth: 3,
            maxBufferSize: 8,
            canopyDepth: 2,
          },
        },
      });

      await sendTransaction(
        tx,
        [adminKeypair],
        "createCreateNewResourceTreeTransaction" + resource.address
      );

      log("created resource tree", treeAddress);
    }

    // load the resources from the client
    await client
      .findResources({
        projects: [project.address],
        addresses: resourcesAddresses,
      })
      .then(({ resources: resourcesT }) => {
        resources = resourcesT;
      });

    expect(resources.length).toBe(2);
    resources.forEach((resource) => {
      expect(resource.storage.kind).toBe(ResourceStorageEnum.LedgerState);
      expect(resource.storage.params?.merkle_trees?.merkle_trees.length).toBe(
        1
      );
    });
  });

  it("create a recipe", async () => {
    if (!resources.length) throw new Error(`Resources not created`);

    if (!recipeAddress) {
      const {
        createInitializeRecipeTransaction: { recipe, transactions },
      } = await client.createInitializeRecipeTransaction({
        xp: "100",
        project: project.address,
        authority: adminKeypair.publicKey.toString(),
        meal: {
          resourceAddress: resources[1].address,
          amount: String(1000 * 10 ** 6),
        },
        ingredients: [
          {
            resourceAddress: resources[0].address,
            amount: String(100 * 10 ** 6),
          },
        ],
      });

      recipeAddress = recipe;
      for (let tx of transactions.transactions) {
        await sendTransaction(
          {
            transaction: tx,
            blockhash: transactions.blockhash,
            lastValidBlockHeight: transactions.lastValidBlockHeight,
          },
          [adminKeypair],
          "createInitializeRecipeTransaction" + recipe
        );
      }
      log("created a recipe", recipeAddress);
    }

    await client
      .findRecipes({
        addresses: [recipeAddress],
      })
      .then(({ recipes }) => {
        recipe = recipes[0];
      });

    expect(recipe).toBeTruthy();
  });

  it("create a lut address & extend all the known addresses", async () => {
    if (!recipe) throw new Error(`Recipe not created`);
    if (!resources.length) throw new Error(`Resources not created`);
    if (!project) throw new Error(`Project not created`);

    if (!lutAddress) {
      const slot = await connection.getSlot();
      const [lookupTableInstruction, lookupTableAddressPub] =
        AddressLookupTableProgram.createLookupTable({
          authority: adminKeypair.publicKey,
          payer: adminKeypair.publicKey,
          recentSlot: slot,
        });

      const extendLutInstruction = AddressLookupTableProgram.extendLookupTable({
        addresses: [
          ...resources.flatMap((resource) => [
            new PublicKey(resource.address),
            new PublicKey(resource.mint),
          ]),
          new PublicKey(recipe.address),
          new PublicKey(project.address),
          TOKEN_PROGRAM_ID,
          HPL_RESOURCE_MANAGER_PROGRAM,
          METADATA_PROGRAM_ID,
          SPL_NOOP_PROGRAM_ID,
          SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
          SYSVAR_CLOCK_PUBKEY,
          TOKEN_2022_PROGRAM_ID,
          SYSVAR_INSTRUCTIONS_PUBKEY,
          SystemProgram.programId,
          HPL_HIVE_CONTROL_PROGRAM,
          VAULT,
        ],
        lookupTable: lookupTableAddressPub,
        payer: adminKeypair.publicKey,
        authority: adminKeypair.publicKey,
      });

      const txn = new Transaction().add(
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

      lutAddress = lookupTableAddressPub.toBase58();
      log("created a lut", lutAddress);
    }

    expect(lutAddress).toBeTruthy();
  });

  it("mint resources", async () => {
    if (!resources.length) throw new Error(`Resources not created`);

    for (let resource of resources) {
      const merkleTrees = getResourceMerkleTree(resource);
      if (!merkleTrees) throw new Error(`Active merkle tree not found`);

      let {
        holdings: [holding],
      } = await client.findHoldings({
        trees: merkleTrees.merkle_trees,
        holder: userKeypair.publicKey.toString(),
      });

      if (holding) continue;

      log("Minting resources");
      const { createMintResourceTransaction: tx } =
        await client.createMintResourceTransaction({
          resource: resource.address,
          authority: adminKeypair.publicKey.toString(),
          owner: userKeypair.publicKey.toString(),
          amount: String(1000 * 10 ** 6),
        });

      await sendTransaction(
        tx,
        [adminKeypair],
        "createMintResourceTransaction" + resource.address
      );
    }

    await client
      .findHoldings({
        trees: resources.flatMap(
          (resource) => resource.storage.params?.merkle_trees.merkle_trees
        ) as string[],
        holder: userKeypair.publicKey.toString(),
      })
      .then(({ holdings }) => {
        expect(holdings.length).toBe(resources.length);
        holdings.forEach((holding) => {
          expect(holding).toBeTruthy();
          expect(holding.holder).toBe(userKeypair.publicKey.toString());
          expect(holding.balance).toBe(String(1000 * 10 ** 6));
        });
      });
  });

  it("burn resources", async () => {
    if (!resources.length) throw new Error(`Resources not created`);

    for (let resource of resources) {
      const merkleTrees = getResourceMerkleTree(resource);
      if (!merkleTrees) throw new Error(`Active merkle tree not found`);

      const {
        holdings: [holding],
      } = await client.findHoldings({
        trees: merkleTrees.merkle_trees,
        holder: userKeypair.publicKey.toString(),
      });

      if (!holding) throw new Error(`Resource not minted`);
      if (holding.balance !== String(1000 * 10 ** 6)) continue;

      log("Burning resources");
      const { createBurnResourceTransaction: tx } =
        await client.createBurnResourceTransaction({
          resource: resource.address,
          authority: userKeypair.publicKey.toString(),
          amount: String(100 * 10 ** 6),
        });

      await sendTransaction(
        tx,
        [userKeypair],
        "createBurnResourceTransaction" + resource.address
      );
    }

    await client
      .findHoldings({
        trees: resources.flatMap(
          (resource) => resource.storage.params?.merkle_trees.merkle_trees
        ) as string[],
        holder: userKeypair.publicKey.toString(),
      })
      .then(({ holdings }) => {
        expect(holdings.length).toBe(resources.length);
        holdings.forEach((holding) => {
          expect(holding).toBeTruthy();
          expect(holding.holder).toBe(userKeypair.publicKey.toString());
          expect(holding.balance).toBe(String(900 * 10 ** 6));
        });
      });
  });

  it("transfer resources", async () => {
    if (!resources.length) throw new Error(`Resources not created`);

    log("Transferring resources");
    for (let resource of resources) {
      const { createTransferResourceTransaction: tx } =
        await client.createTransferResourceTransaction({
          resource: resource.address,
          owner: userKeypair.publicKey.toString(),
          recipient: adminKeypair.publicKey.toString(),
          amount: String(100 * 10 ** 6),
        });

      await sendTransaction(
        tx,
        [userKeypair],
        "createTransferResourceTransaction" + resource.address
      );
    }

    await client
      .findHoldings({
        trees: resources.flatMap(
          (resource) => resource.storage.params?.merkle_trees.merkle_trees
        ) as string[],
        holder: adminKeypair.publicKey.toString(),
      })
      .then(({ holdings }) => {
        expect(holdings.length).toBe(resources.length);
        holdings.forEach((holding) => {
          expect(holding).toBeTruthy();
          expect(holding.holder).toBe(adminKeypair.publicKey.toString());
          expect(holding.balance).toBe(String(100 * 10 ** 6));
        });
      });
  });

  it("unwrap a holding", async () => {
    if (!resources.length) throw new Error(`Resources not created`);
    const resource = resources[0];
    const merkleTrees = getResourceMerkleTree(resource);
    if (!merkleTrees) throw new Error(`Active merkle tree not found`);

    const {
      holdings: [holding],
    } = await client.findHoldings({
      trees: merkleTrees.merkle_trees,
      holder: userKeypair.publicKey.toString(),
    });

    if (!holding) throw new Error(`Resource not minted`);

    log("Unwrapping resources");
    const { createCreateUnwrapHoldingTransaction: tx } =
      await client.createCreateUnwrapHoldingTransaction({
        resource: resource.address,
        authority: userKeypair.publicKey.toString(),
        amount: String(100 * 10 ** 6),
      });

    await sendTransaction(
      tx,
      [userKeypair],
      "createUnwrapResourceTransaction" + resource.address
    );

    await client
      .findHoldings({
        trees: merkleTrees.merkle_trees,
        holder: userKeypair.publicKey.toString(),
      })
      .then(({ holdings }) => {
        const holding = holdings[0];
        expect(holding).toBeTruthy();
        expect(holding.holder).toBe(userKeypair.publicKey.toString());
      });
  });

  it("wrap a holding", async () => {
    if (!resources.length) throw new Error(`Resources not created`);
    const resource = resources[0];
    const merkleTrees = getResourceMerkleTree(resource);
    if (!merkleTrees) throw new Error(`Active merkle tree not found`);

    const {
      holdings: [holding],
    } = await client.findHoldings({
      trees: merkleTrees.merkle_trees,
      holder: userKeypair.publicKey.toString(),
    });

    if (!holding) throw new Error(`Resource not minted`);

    log("Wrapping resources");
    const { createCreateWrapHoldingTransaction: tx } =
      await client.createCreateWrapHoldingTransaction({
        resource: resource.address,
        authority: userKeypair.publicKey.toString(),
        amount: String(100 * 10 ** 6),
      });

    await sendTransaction(
      tx,
      [userKeypair],
      "createWrapResourceTransaction" + resource.address
    );

    await client
      .findHoldings({
        trees: merkleTrees.merkle_trees,
        holder: userKeypair.publicKey.toString(),
      })
      .then(({ holdings }) => {
        const holding = holdings[0];
        expect(holding).toBeTruthy();
        expect(holding.holder).toBe(userKeypair.publicKey.toString());
      });
  });

  it("cooking process", async () => {
    if (!recipe) throw new Error(`Recipe not created`);

    const {
      createInitCookingProcessTransactions: {
        transactions,
        blockhash,
        lastValidBlockHeight,
      },
    } = await client.createInitCookingProcessTransactions({
      recipe: recipe.address,
      authority: userKeypair.publicKey.toString(),
      lutAddresses: [lutAddress],
    });

    for (let tx of transactions) {
      await sendTransaction(
        {
          transaction: tx,
          blockhash,
          lastValidBlockHeight,
        },
        [userKeypair],
        "createInitCookingProcessTransactions" + recipe.address
      );
    }
  });
});
