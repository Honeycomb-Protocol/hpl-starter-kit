console.warn = () => {}

import { wait } from "@honeycomb-protocol/hive-control";
import {
    CharacterModel,
    Project,
    Resource,
    ResourceStorageEnum,
} from "@honeycomb-protocol/edge-client";
import {
    AssetResponse, mintAssets,
    adminKeypair,
    client,
    connection,
    createProject,
    createTokenExtensionMint,
    mintTokensAndRevokeMintAuthority,
    sendTransaction,
    sendTransactions,
    umi,
    userKeypair,
} from "../../utils";
import { ExtensionType } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { log } from "console";

const totalNfts = 0;
const totalcNfts = 0;
const totalMplCoreNfts = 1;
const totalExtensionsNft = 0;

describe("Test Character Manager Txs", () => {
    let projectAddress: string;
    let mints: {
        address: string;
        resourceAddress: string | null;
        isLedger: boolean;
        isRevoked: boolean;
    }[] = [];

    let project: Project;
    let resources: Resource[];
    let characterModel: CharacterModel;
    let assets: AssetResponse = {};

    beforeAll(async () => {
        assets = await mintAssets(
            umi,
            {
                cnfts: totalcNfts,
                core: totalMplCoreNfts,
                pnfts: totalNfts,
                token22: totalExtensionsNft,
            },
            userKeypair.publicKey
        );

        if (!projectAddress) {
            project = await createProject();
            projectAddress = project.address;
        } else {
            project = await client
                .findProjects({ addresses: [projectAddress] })
                .then(({ project }) => project[0]);
        }

        log("created project", projectAddress);

        // create a token22 mints for importing into resource
        if (!mints.length) {
            for (let i = 0; i < 4; i++) {
                const mintKeypair = await createTokenExtensionMint(
                    [
                        ExtensionType.MintCloseAuthority,
                        ExtensionType.PermanentDelegate,
                        ExtensionType.MetadataPointer,
                    ],
                    adminKeypair,
                    {
                        name: "Bonk",
                        symbol: "TST",
                        uri: "https://example.com",
                    }
                );

                mints.push({
                    address: String(mintKeypair.publicKey),
                    resourceAddress: null,
                    isLedger: false,
                    isRevoked: false,
                });
            }

            if (!mints.length) throw new Error(`Mint not created`);

            // mint tokens and revoke mint authority
            await mintTokensAndRevokeMintAuthority(new PublicKey(mints[1].address));
            mints[1].isRevoked = true;
            mints[2].isLedger = true;

            await mintTokensAndRevokeMintAuthority(new PublicKey(mints[3].address));
            mints[3].isRevoked = true;
            mints[3].isLedger = true;
        }
    });

    it("Prepare Resources", async () => {
        if (!project) throw new Error(`Project not created`);
        if (!mints.length) throw new Error(`Mint not created`);

        for (const mint of mints) {
            if (mint.resourceAddress) continue;

            const {
                createImportFungibleResourceTransaction: {
                    resource: resourceAddress,
                    tx: importResourceTx,
                },
            } = await client.createImportFungibleResourceTransaction({
                params: {
                    decimals: 6,
                    mint: mint.address,
                    project: projectAddress,
                    tags: ["Potion"],
                    authority: adminKeypair.publicKey.toBase58(),
                    storage: mint.isLedger
                        ? ResourceStorageEnum.LedgerState
                        : ResourceStorageEnum.AccountState,
                    custody: mint.isRevoked
                        ? {
                            supply: String(1000000 * 10 ** 6),
                        }
                        : undefined,
                },
            });

            await sendTransaction(
                importResourceTx,
                [adminKeypair],
                "ImportFungibleResourceTransaction"
            );

            // save resource address
            mint.resourceAddress = resourceAddress;

            // if ledger state, create a resource tree
            if (mint.isLedger) {
                const {
                    createCreateNewResourceTreeTransaction: { tx, treeAddress },
                } = await client.createCreateNewResourceTreeTransaction({
                    resource: resourceAddress,
                    project: projectAddress,
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
                    "createCreateNewResourceTreeTransaction" + resourceAddress
                );

                log("created resource tree", treeAddress);
            }
        }

        await wait(5);

        log(
            "Resources imported",
            mints.map((x) => x.resourceAddress)
        );

        // load the resources from the client
        await client
            .findResources({
                projects: [project.address],
                addresses: mints.map((x) => x.resourceAddress as string),
            })
            .then(({ resources: resourcesT }) => {
                resources = resourcesT;
            });

        expect(resources).toHaveLength(mints.length);
        resources.forEach((resource) => {
            expect(resource).toBeTruthy();
            expect(resource.project).toBe(projectAddress);
        });
    });

    it("Mint Resources", async () => {
        if (!project) throw new Error(`Project not created`);
        if (!mints.length) throw new Error(`Resource not created`);

        for (const mint of mints) {
            if (!mint.resourceAddress) continue;

            const { createMintResourceTransaction: mintResourceTx } =
                await client.createMintResourceTransaction({
                    resource: mint.resourceAddress,
                    authority: adminKeypair.publicKey.toString(),
                    owner: userKeypair.publicKey.toString(),
                    amount: "2000",
                });

            await sendTransaction(
                mintResourceTx,
                [adminKeypair],
                "MintFungibleResourceTransaction"
            );
        }

        await wait(7);

        const { holdings } = await client.findHoldings({
            holders: [userKeypair.publicKey.toString()],
            trees: resources.flatMap(
                (x) => x.storage.params?.merkle_trees.merkle_trees || []
            ) as string[],
        });

        expect(holdings).toHaveLength(2);
        holdings.forEach((holding) => {
            expect(holding).toBeTruthy();
            expect(holding.holder).toBe(userKeypair.publicKey.toString());
            expect(holding.balance).toBe("2000");
        });

        log("Minted Resources", mints);
    });

    it("Create/Load Character Model", async () => {
        const {
            createCreateCharacterModelTransaction: {
                tx: txResponse,
                characterModel: characterModelAddress,
            },
        } = await client.createCreateCharacterModelTransaction({
            config: {
                kind: "Wrapped",
                criterias: Object.values(assets)
                    .filter((x) => !!x)
                    .map(({ group, asset }) => ({
                        kind: asset == "MPL_BG" ? "MerkleTree" : "Collection",
                        params: group.toString(),
                    })),
            },
            equipableCriteria: ["Potion"],
            project: project.address,
            authority: adminKeypair.publicKey.toString(),
            payer: adminKeypair.publicKey.toString(),
            cooldown: {
                ejection: 1,
            }
        });

        await sendTransaction(
            txResponse,
            [adminKeypair],
            "createCreateCharacterModelTransaction"
        );

        console.log("Created Character Model", characterModelAddress);
        characterModel = await client
            .findCharacterModels({
                addresses: [characterModelAddress],
            })
            .then((res) => res.characterModel[0]);
        expect(characterModel).toBeTruthy();

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
                        canopyDepth: 2,
                    },
                },
                project: project.address,
                characterModel: characterModelAddress,
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
                    addresses: [characterModelAddress],
                })
                .then((res) => res.characterModel[0]);
        }
    });

    it("Wrap Assets to Character", async () => {
        const preBalance = await connection.getBalance(userKeypair.publicKey);

        let mints: string[] = [];
        if (assets.core) {
            mints.push(...assets.core.mints);
        }
        if (assets.pnfts) {
            mints.push(...assets.pnfts.mints);
        }
        if (assets.cnfts) {
            mints.push(...assets.cnfts.mints.map((x) => x.mint.toString()));
        }
        if (assets.token22) {
            mints.push(...assets.token22.mints.map((x) => x.toString()));
        }
        if (!mints.length) throw new Error("No Assets to wrap");

        const { createWrapAssetsToCharacterTransactions: txResponse } =
            await client.createWrapAssetsToCharacterTransactions({
                project: project.address,
                characterModel: characterModel.address,
                wallet: userKeypair.publicKey.toString(),
                mintList: mints,
            });

        await sendTransactions(
            txResponse,
            [userKeypair],
            "createWrapAssetsToCharacterTransactions"
        );

        console.log("Wrapped Assets to Character", mints);

        const postBalance = await connection.getBalance(userKeypair.publicKey);
        // expect(preBalance).toBe(postBalance);

        const { character: characters } = await client.findCharacters({
            mints,
        });
        expect(characters.length).toBe(mints.length);
        for (let character of characters) {
            expect(character.usedBy.kind).toBe("None");
        }
    });

    it("Equip Resources to Character", async () => {
        const character = await client
            .findCharacters({
                mints: assets.core?.mints[0],
            })
            .then(({ character }) => character[0]);
        if (!character) throw new Error("No Character to equip");

        for (const mint of mints) {
            const { createEquipResourceOnCharacterTransaction: txResponse } =
                await client.createEquipResourceOnCharacterTransaction({
                    characterModel: characterModel.address,
                    characterAddress: character!.address,
                    resource: mint.resourceAddress as string,
                    owner: userKeypair.publicKey.toString(),
                    amount: "1000",
                });

            await sendTransaction(
                txResponse,
                [userKeypair, adminKeypair],
                "createEquipResourcesToCharacterTransaction"
            );

            await wait(5);
        }

        await wait(15);
        const {
            character: [characterRefetch],
        } = await client.findCharacters({
            addresses: [character!.address],
        });

        expect(characterRefetch.equipments).toBeTruthy();
        console.log("Equipped Resources to Character", characterRefetch.equipments);
    });

    it("Dismount Resources to Character", async () => {
        const character = await client
            .findCharacters({
                mints: assets.core?.mints[0],
            })
            .then(({ character }) => character[0]);
        if (!character) throw new Error("No Character to equip");

        for (const mint of mints) {
            const { createDismountResourceOnCharacterTransaction: txResponse } =
                await client.createDismountResourceOnCharacterTransaction({
                    characterModel: characterModel.address,
                    characterAddress: character!.address,
                    resource: mint.resourceAddress as string,
                    owner: userKeypair.publicKey.toString(),
                    amount: "1000",
                });

            await sendTransaction(
                txResponse,
                [userKeypair],
                "createDismountResourceFromCharacterTransaction"
            );

            await wait(5);
        }

        await wait(15);

        const {
            character: [characterRefetch],
        } = await client.findCharacters({
            addresses: [character!.address],
        });

        expect(characterRefetch.equipments).toBeTruthy();
        console.log(
            "Dismounted Resources to Character",
            characterRefetch.equipments
        );
    });

    it("Unwrap Assets from Character", async () => {
        const preBalance = await connection.getBalance(userKeypair.publicKey);

        const trees = characterModel.merkle_trees.merkle_trees.map((x) =>
            x.toString()
        );
        const { character } = await client.findCharacters({
            filters: {
                owner: userKeypair.publicKey.toString(),
            },
            trees,
        });

        if (!character?.length) throw new Error("No characters to unwrap");

        const { createUnwrapAssetsFromCharacterTransactions: txResponse } =
            await client.createUnwrapAssetsFromCharacterTransactions({
                characterAddresses: character.map((x) => x!.address),
                project: project.address,
                characterModel: characterModel.address,
                wallet: userKeypair.publicKey.toString(),
            });

        await sendTransactions(
            txResponse,
            [userKeypair],
            "createUnwrapAssetsFromCharacterTransactions"
        );

        const postBalance = await connection.getBalance(userKeypair.publicKey);
        // expect(preBalance).toBe(postBalance);

        const { character: characterRefetch } = await client.findCharacters({
            addresses: character.map((x) => x!.address),
        });
        expect(characterRefetch.length).toBe(character.length);
        for (let character of characterRefetch) {
            expect(character.usedBy.kind).toBe("Ejected");
        }
    });
});
