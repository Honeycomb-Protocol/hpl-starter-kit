import * as web3 from "@solana/web3.js";
import base58 from "bs58";
import fs from "fs";
import path from "path";

import { Client, fetchExchange } from "@urql/core";

import createEdgeClient, {
    HiveControlPermissionInput,
    Profile,
    Project,
    Transaction,
    User,
} from "@honeycomb-protocol/edge-client";
import nacl from "tweetnacl";

jest.setTimeout(200000);

require("dotenv").config();

const API_URL = process.env.API_URL ?? "http://localhost:4000/";

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

describe("Test Character Manager Txs", () => {
    let user: User;
    let accessToken: string;
    let projectAddress: string;
    let project: Project;
    let profile: Profile;

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

    it("Creates/Loads User", async () => {
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

            await sendTransaction("createNewUserTransaction", txResponse);

            await new Promise((resolve) => setTimeout(resolve, 1000));

            await client
                .findUsers({
                    wallets: [userKeypair.publicKey.toString()],
                })
                .then(({ user: [userT] }) => (user = userT));
        }

        expect(user).toBeTruthy();

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
    });

    it("Update User", async () => {
        const { createUpdateUserTransaction: txResponse } =
            await client.createUpdateUserTransaction(
                {
                    info: userInfo,
                },
                {
                    fetchOptions: {
                        headers: {
                            authorization: `Bearer ${accessToken}`,
                        },
                    },
                }
            );

        await sendTransaction("createUpdateUserTransaction", txResponse);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        await client
            .findUsers({
                wallets: [userKeypair.publicKey.toString()],
            })
            .then(({ user: [userT] }) => (user = userT));

        expect(user).toBeTruthy();
        expect(user.info.username).toBe(userInfo.username);
    });

    it("Creates/Loads Project", async () => {
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
                "createCreateProjectTransaction",
                txResponse,
                adminKeypair
            );

            projectAddress = projectAddressT;
        }
        console.log("projectAddress", projectAddress);
        project = await client
            .findProjects({ ids: [projectAddress] })
            .then((res) => res.project[0]);
        expect(project).toBeTruthy();
    });

    it("Change Project Driver", async () => {
        const { createChangeProjectDriverTransaction: txResponse } =
            await client.createChangeProjectDriverTransaction({
                project: project.id,
                driver: userKeypair.publicKey.toString(),
                authority: adminKeypair.publicKey.toString(),
            });

        await sendTransaction(
            "createChangeProjectDriverTransaction",
            txResponse,
            adminKeypair
        );

        await client
            .findProjects({
                ids: [project.id],
            })
            .then(({ project: [projectT] }) => (project = projectT));

        expect(project).toBeTruthy();
        expect(project.driver).toBe(userKeypair.publicKey.toString());
    });

    it("Create Project Delegate Authority", async () => {
        const { createCreateDelegateAuthorityTransaction: txResponse } =
            await client.createCreateDelegateAuthorityTransaction({
                project: project.id,
                delegate: userKeypair.publicKey.toString(),
                serviceDelegations: {
                    HiveControl: [
                        {
                            permission: HiveControlPermissionInput.ManageCriterias,
                        },
                    ],
                },
                authority: adminKeypair.publicKey.toString(),
            });

        await sendTransaction(
            "createCreateDelegateAuthorityTransaction",
            txResponse,
            adminKeypair
        );

        await client
            .findProjects({
                ids: [project.id],
            })
            .then(({ project: [projectT] }) => (project = projectT));

        expect(project).toBeTruthy();
        expect(project.authority).toBe(adminKeypair.publicKey.toString());
    });

    it("Modify Project Delegate Authority", async () => {
        const { createModifyDelegationTransaction: txResponse } =
            await client.createModifyDelegationTransaction({
                project: project.id,
                delegate: userKeypair.publicKey.toString(),
                modifyDelegation: {
                    delegation: {
                        HiveControl: {
                            permission: HiveControlPermissionInput.ManageProfiles,
                        },
                    },
                },
                authority: adminKeypair.publicKey.toString(),
            });

        await sendTransaction(
            "createCreateDelegateAuthorityTransaction",
            txResponse,
            adminKeypair
        );

        await client
            .findProjects({
                ids: [project.id],
            })
            .then(({ project: [projectT] }) => (project = projectT));

        expect(project).toBeTruthy();
        expect(project.authority).toBe(adminKeypair.publicKey.toString());
    });

    it("Creates/Loads Profiles Tree", async () => {
        if (!project.profileTrees.merkle_trees[project.profileTrees.active]) {
            const { createCreateProfilesTreeTransaction: txResponse } =
                await client.createCreateProfilesTreeTransaction({
                    treeConfig: {
                        maxDepth: 14,
                        maxBufferSize: 64,
                        canopyDepth: 12,
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
    });

    it("Creates/Loads User with Profile", async () => {
        await client
            .findUsers({
                wallets: [userKeypair.publicKey.toString()],
            })
            .then(({ user: [userT] }) => (user = userT));

        if (!user) {
            const { createNewUserWithProfileTransaction: txResponse } =
                await client.createNewUserWithProfileTransaction({
                    userInfo,
                    profileInfo,
                    wallet: userKeypair.publicKey.toString(),
                    project: project.id,
                });

            await sendTransaction("createNewUserTransaction", txResponse);

            await new Promise((resolve) => setTimeout(resolve, 1000));

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
        }

        expect(user).toBeTruthy();
        // expect(user.info.username).toBe(userInfo.username);
        expect(user.info.name).toBe(userInfo.name);
        expect(user.info.bio).toBe(userInfo.bio);
        expect(user.info.pfp).toBe(userInfo.pfp);

        await client
            .findProfiles({
                userIds: [user.id],
                projects: [projectAddress],
            })
            .then(({ profile: [profileT] }) => (profile = profileT));

        if (!profile) {
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
                })
                .then(({ profile: [profileT] }) => (profile = profileT));
        }

        console.log("Profile Id", profile.id);

        expect(profile).toBeTruthy();
        expect(profile.info.name).toBe(profileInfo.name);
        expect(profile.info.bio).toBe(profileInfo.bio);
        expect(profile.info.pfp).toBe(profileInfo.pfp);
    });

    it("Update Profile", async () => {
        const name = user.info.name + "_profile";
        const { createUpdateProfileTransaction: txResponse } =
            await client.createUpdateProfileTransaction(
                {
                    profileId: profile.id,
                    info: {
                        name,
                    },
                    customData: {
                        add: {
                            customField: ["customValue"],
                        },
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

        await sendTransaction("createUpdateProfileTransaction", txResponse);

        await new Promise((resolve) => setTimeout(resolve, 1000));

        await client
            .findProfiles({
                userIds: [user.id],
                projects: [projectAddress],
            })
            .then(({ profile: [profileT] }) => (profile = profileT));

        console.log("profile", profile);

        expect(profile).toBeTruthy();
        expect(profile.info.name).toBe(name);
        expect(profile.customData.customField[0]).toBe("customValue");
    });
});
