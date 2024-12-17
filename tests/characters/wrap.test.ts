console.warn = () => {}

import { CharacterModel, Project } from "@honeycomb-protocol/edge-client";
import { AssetResponse, mintAssets } from "../../utils";
import {
    adminKeypair,
    client,
    connection,
    createProject,
    sendTransaction,
    sendTransactions,
    umi,
    userKeypair,
} from "../../utils";

const totalMplCoreNfts = 1;
const totalNfts = 1;
const totalcNfts = 1;
const totalExtensionsNft = 0;

describe("Test Character Manager Txs", () => {
    let project: Project;
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

        project = await createProject();
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
                        canopyDepth: 3,
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
