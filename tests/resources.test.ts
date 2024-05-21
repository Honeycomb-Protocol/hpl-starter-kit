import {
    HPL_HIVE_CONTROL_PROGRAM,
    VAULT,
} from "@honeycomb-protocol/hive-control";
import { PROGRAM_ID } from "@honeycomb-protocol/resource-manager";
import {
    SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
    SPL_NOOP_PROGRAM_ID,
} from "@solana/spl-account-compression";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import { Client, fetchExchange } from "@urql/core";
import base58 from "bs58";
import fs from "fs";
import path from "path";
import createEdgeClient, {
    Profile,
    Project,
    Recipe,
    Resource,
    Transaction,
    User,
} from "@honeycomb-protocol/edge-client";
import { PROGRAM_ID as METADATA_PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import nacl from "tweetnacl";

jest.setTimeout(200000);

require("dotenv").config();

const API_URL = process.env.API_URL ?? "http://localhost:4000/";
const RPC_URL = process.env.RPC_URL ?? "http://localhost:8899/";

const connection = new web3.Connection(RPC_URL);
const client = createEdgeClient(
    new Client({
        url: API_URL,
        exchanges: [fetchExchange],
    })
);

const adminKeypair = web3.Keypair.fromSecretKey(
    Uint8Array.from(
        JSON.parse(
            fs.readFileSync(path.resolve(__dirname, "keys", "admin.json"), "utf8")
        )
    )
);

const userKeypair = web3.Keypair.fromSecretKey(
    Uint8Array.from(
        JSON.parse(
            fs.readFileSync(path.resolve(__dirname, "keys", "user.json"), "utf8")
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

    console.log("Sending Transaction", action);
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

describe("Resource Manager", () => {
    let projectAddress: string;
    let project: Project;
    let user: User;
    let profile: Profile;
    let accessToken: string;

    // Resource Manager
    let resourceAddresses: string[] = [];
    let faucetAddress: string;
    let trees: string[] = [];
    let resources: Resource[] = [];
    let recipeAddress: string;
    let recipe: Recipe;
    let lookupTableAddress: string;

    beforeAll(async () => {
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

        if (!projectAddress) {
            // Create a project transaction
            const {
                createCreateProjectTransaction: { tx, project: projectAddressT },
            } = await client.createCreateProjectTransaction({
                name: "Test Project",
                authority: adminKeypair.publicKey.toString(),
                payer: adminKeypair.publicKey.toString(),
            });

            // Send the transaction
            await sendTransaction("Create Project", tx, adminKeypair);
            projectAddress = projectAddressT;
            console.log("Project Address", projectAddress);
        }

        // Get the project
        project = await client
            .findProjects({ ids: [projectAddress] })
            .then((res) => res.project[0]);

        expect(project).toBeTruthy();

        await Promise.resolve(() =>
            setTimeout(
                () => { },
                3000 // 3 seconds
            )
        );

        if (!project.profileTrees.merkle_trees[project.profileTrees.active]) {
            console.log("Creating Profile Tree");
            const { createCreateProfilesTreeTransaction: txResponse } =
                await client.createCreateProfilesTreeTransaction({
                    treeConfig: {
                        maxDepth: 14,
                        maxBufferSize: 64,
                        canopyDepth: 13,
                    },
                    project: project.id,
                    authority: adminKeypair.publicKey.toString(),
                });

            await sendTransaction(
                "createCreateProfilesTreeTransaction",
                txResponse,
                adminKeypair
            );

            await client
                .findProjects({
                    ids: [project.id],
                })
                .then(({ project: [projectT] }) => (project = projectT));
        }

        expect(
            project.profileTrees.merkle_trees[project.profileTrees.active]
        ).toBeTruthy();

        await Promise.resolve(
            setTimeout(
                () => { },
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
                    project: project.id,
                });

            await sendTransaction("createNewUserTransaction", txResponse);
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
                projects: [projectAddress],
                includeProof: true,
            })
            .then(({ profile: [profileT] }) => (profile = profileT));

        if (!profile) {
            console.log("Creating Profile");
            const { createNewProfileTransaction: txResponse } =
                await client.createNewProfileTransaction(
                    {
                        project: project.id,
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
                    projects: [projectAddress],
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

    it("Create/Load Resources", async () => {
        if (!projectAddress) throw new Error("Project not found");

        if (!resourceAddresses.length) {
            const resourcesTxn = [
                (
                    await client.createCreateNewResourceTransaction({
                        authority: adminKeypair.publicKey.toString(),
                        name: "Test Resource",
                        uri: "https://qgp7lco5ylyitscysc2c7clhpxipw6sexpc2eij7g5rq3pnkcx2q.arweave.net/gZ_1id3C8InIWJC0L4lnfdD7ekS7xaIhPzdjDb2qFfU",
                        project: projectAddress,
                        symbol: "TST",
                        payer: adminKeypair.publicKey.toString(),
                        kind: {
                            kind: "Fungible",
                            params: {
                                decimals: 6,
                            },
                        },
                    })
                ).createCreateNewResourceTransaction,
                (
                    await client.createCreateNewResourceTransaction({
                        authority: adminKeypair.publicKey.toString(),
                        name: "Test Resource",
                        uri: "https://qgp7lco5ylyitscysc2c7clhpxipw6sexpc2eij7g5rq3pnkcx2q.arweave.net/gZ_1id3C8InIWJC0L4lnfdD7ekS7xaIhPzdjDb2qFfU",
                        project: projectAddress,
                        symbol: "TST",
                        payer: adminKeypair.publicKey.toString(),
                        kind: {
                            kind: "Fungible",
                            params: {
                                decimals: 6,
                            },
                        },
                    })
                ).createCreateNewResourceTransaction,
            ];

            // Send the transactions
            await Promise.all(
                resourcesTxn.map(({ tx }) =>
                    sendTransaction("Create Resource", tx, adminKeypair)
                )
            );

            resourceAddresses = resourcesTxn.map(({ resource }) => resource);
            console.log("Resource Addresses", resourceAddresses);
        }

        resources = await client
            .findResources({ ids: resourceAddresses, projects: [projectAddress] })
            .then((res) => res.resources);

        // append the resources tree to the trees array if it exists
        resources.forEach((resource) => {
            trees.push(...resource.merkle_trees.merkle_trees);
        });

        expect(resources.length).toBe(2);
        expect(resources[0].project).toBe(projectAddress);
    });

    it("Init/Load Resource Tree", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!trees.length) {
            for (const resourceAddress of resourceAddresses) {
                // Create a resource tree transaction
                const {
                    createCreateNewResourceTreeTransaction: {
                        tree: merkleTreeAddressT,
                        tx,
                    },
                } = await client.createCreateNewResourceTreeTransaction({
                    project: projectAddress,
                    resource: resourceAddress,
                    payer: adminKeypair.publicKey.toString(),
                    authority: adminKeypair.publicKey.toString(),
                    treeConfig: {
                        maxDepth: 14,
                        maxBufferSize: 64,
                        canopyDepth: 13,
                    },
                });

                // Send the transaction
                await sendTransaction("Init Resource Tree", tx, adminKeypair);
                trees.push(merkleTreeAddressT);
            }
            console.log("Resource Trees", trees);
        }

        resources = await (
            await client.findResources({ ids: resourceAddresses })
        ).resources;

        expect(true).toBe(
            trees.includes(resources[0].merkle_trees.merkle_trees[0]) &&
            trees.includes(resources[1].merkle_trees.merkle_trees[0])
        );
    });

    it("Mint Resources", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!resources) throw new Error("Resource not found");

        const { createMintResourceTransaction: txResponse } =
            await client.createMintResourceTransaction({
                amount: 1000,
                resource: resources[0].id,
                owner: userKeypair.publicKey.toString(),
                payer: adminKeypair.publicKey.toString(),
                authority: adminKeypair.publicKey.toString(),
            });

        // Send the transaction
        await sendTransaction("Mint Resources", txResponse, adminKeypair);

        const holding = await client
            .findHoldings({
                holder: userKeypair.publicKey.toString(),
                trees: resources[0].merkle_trees.merkle_trees.map((x) => x.toString()),
                includeProof: true,
            })
            .then((res) => res.holdings[0]);

        expect(holding.tree_id).toEqual(resources[0].merkle_trees.merkle_trees[0]);
    });

    it("Burn Resources", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!resources) throw new Error("Resource not found");

        const { createBurnResourceTransaction: txResponse } =
            await client.createBurnResourceTransaction({
                amount: 100,
                resource: resources[0].id,
                owner: userKeypair.publicKey.toString(),
                authority: userKeypair.publicKey.toString(),
            });

        // Send the transaction
        await sendTransaction("Burn Resources", txResponse, userKeypair);

        const holding = await client
            .findHoldings({
                holder: userKeypair.publicKey.toString(),
                trees: resources[0].merkle_trees.merkle_trees.map((x) => x.toString()),
                includeProof: true,
            })
            .then((res) => res.holdings[0]);

        expect(holding.tree_id).toEqual(resources[0].merkle_trees.merkle_trees[0]);
    });

    it("Unwrap Resource", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!resources) throw new Error("Resource not found");

        const { createCreateUnwrapResourceTransaction: txResponse } =
            await client.createCreateUnwrapResourceTransaction({
                amount: 100,
                project: projectAddress,
                resource: resources[0].id,
                authority: userKeypair.publicKey.toString(),
            });

        // Send the transaction
        await sendTransaction("Unwrap Resource", txResponse, userKeypair);
    });

    it("Wrap Resource", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!resources) throw new Error("Resource not found");

        const { createCreateWrapResourceTransaction: txResponse } =
            await client.createCreateWrapResourceTransaction({
                project: projectAddress,
                resource: resources[0].id,
                amount: 100,
                authority: userKeypair.publicKey.toString(),
                payer: userKeypair.publicKey.toString(),
            });

        // Send the transaction
        await sendTransaction("Wrap Resource", txResponse, userKeypair);
    });

    it("Create Faucet", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!resources) throw new Error("Resource not found");

        if (!faucetAddress) {
            const {
                createInitializeFaucetTransaction: { tx: txResponse, faucet },
            } = await client.createInitializeFaucetTransaction({
                amount: 1000,
                repeatInterval: 60,
                project: projectAddress,
                resource: resources[0].id,
                authority: adminKeypair.publicKey.toString(),
            });

            // Send the transaction
            await sendTransaction("Create Faucet", txResponse, adminKeypair);
            faucetAddress = faucet;
            console.log("Faucet Address", faucetAddress);
        }

        const faucet = await client
            .findFaucets({
                ids: [faucetAddress],
            })
            .then((res) => res.faucets[0]);

        expect(faucet).toBeTruthy();
    });

    it("Claim Faucet", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!resources) throw new Error("Resource not found");
        if (!faucetAddress) throw new Error("Faucet not found");

        const { createClaimFaucetTransaction: txResponse } =
            await client.createClaimFaucetTransaction({
                faucet: faucetAddress,
                owner: userKeypair.publicKey.toString(),
            });

        // Send the transaction
        await sendTransaction("Claim Faucet", txResponse, userKeypair);

        // Wait for the transaction to be processed
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const holding = await client
            .findHoldings({
                holder: userKeypair.publicKey.toString(),
                trees: resources[0].merkle_trees.merkle_trees.map((x) => x.toString()),
                includeProof: true,
            })
            .then((res) => res.holdings[0]);

        expect(holding.tree_id).toEqual(resources[0].merkle_trees.merkle_trees[0]);
    });

    it("Create/Load Recipe", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!resources.length) throw new Error("Resource not found");

        if (!recipeAddress) {
            const {
                createCreateNewRecipeTransaction: { tx, recipe: recipeAddressT },
            } = await client.createCreateNewRecipeTransaction({
                project: projectAddress,
                resource: {
                    input: {
                        inputOne: {
                            resource: resources[0].id,
                            amount: 100,
                        },
                    },
                    output: {
                        amount: 100,
                        resource: resources[1].id,
                        characteristics: {},
                    },
                },
                xpLabel: "Test XP",
                xpIncrement: "100",
                payer: adminKeypair.publicKey.toString(),
                authority: adminKeypair.publicKey.toString(),
            });

            // Send the transaction
            await sendTransaction("Create Recipe", tx, adminKeypair);
            recipeAddress = recipeAddressT;
            console.log("Recipe Address", recipeAddress);
        }

        recipe = await client
            .findRecipes({
                ids: [recipeAddress],
            })
            .then((res) => res.recipes[0]);

        expect(recipe).toBeTruthy();
        expect(recipe.output.resource).toBe(resources[1].id);
    });

    it("Create/Load Lut Address", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!resources.length) throw new Error("Resource not found");
        if (!recipeAddress) throw new Error("Recipe not found");

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
                        new web3.PublicKey(resources[0].id),
                        new web3.PublicKey(resources[1].id),
                        new web3.PublicKey(resources[0].merkle_trees.merkle_trees[0]),
                        new web3.PublicKey(resources[1].merkle_trees.merkle_trees[0]),
                        new web3.PublicKey(recipe.id),
                        TOKEN_PROGRAM_ID,
                        TOKEN_2022_PROGRAM_ID,
                        METADATA_PROGRAM_ID,
                        SPL_NOOP_PROGRAM_ID,
                        SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID,
                        web3.SYSVAR_CLOCK_PUBKEY,
                        web3.SYSVAR_INSTRUCTIONS_PUBKEY,
                        web3.SystemProgram.programId,
                        HPL_HIVE_CONTROL_PROGRAM,
                        VAULT,
                        PROGRAM_ID,
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

    it.skip("Craft Resources", async () => {
        if (!projectAddress) throw new Error("Project not found");
        if (!resources.length) throw new Error("Resource not found");
        if (!recipeAddress) throw new Error("Recipe not found");
        if (!accessToken) throw new Error("Access Token not found");

        const { createCraftRecipeTransaction: txResponse } =
            await client.createCraftRecipeTransaction({
                recipe: recipe.id,
                wallet: userKeypair.publicKey.toString(),
                authority: user.wallets.shadow,
                lutAddresses: lookupTableAddress,
            });

        const balance = await connection.getBalance(
            new web3.PublicKey(user.wallets.shadow)
        );

        if (balance > 0) {
            for (let i = 0; i < txResponse.transactions.length; i++) {
                const tx = txResponse.transactions[i];
                const {
                    signWithShadowSignerAndSendBulkTransactions: sendBulkTransactions,
                } = await client.signWithShadowSignerAndSendBulkTransactions(
                    {
                        txs: tx,
                        blockhash: txResponse!.blockhash,
                        lastValidBlockHeight: txResponse!.lastValidBlockHeight,
                        options: {
                            commitment: "processed",
                            skipPreflight: true,
                        },
                    },
                    {
                        fetchOptions: {
                            headers: {
                                authorization: `Bearer ${accessToken}`,
                            },
                        },
                    }
                );

                sendBulkTransactions.forEach((txResponse) => {
                    if (txResponse.status !== "Success") {
                        console.log(
                            "Transaction",
                            txResponse.status,
                            txResponse.error,
                            txResponse.signature
                        );
                    }

                    console.log("Transaction", txResponse.signature);
                });
            }
        } else {
            console.log(
                "Insufficient Balance. Please fund the shadow signer: ",
                user.wallets.shadow
            );

            throw new Error("Insufficient Balance. Please fund the shadow signer");
        }
    });
});
