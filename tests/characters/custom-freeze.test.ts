import { Character, CharacterModel, Project } from "@honeycomb-protocol/edge-client";
import { mintAssets } from "../../utils/assets";
import {
  adminKeypair,
  client,
  createProject,
  sendTransaction,
  sendTransactions,
  umi,
  userKeypair,
  wait,
} from "../../utils";

describe("Test Character Used By", () => {
  let project: Project;
  let characterModel: CharacterModel;
  let character: Character;

  beforeAll(async () => {
    const assets = await mintAssets(
      umi,
      {
        core: 1,
      },
      userKeypair.publicKey
    );
    const mplCore = assets.core!;

    project = await createProject();
    const {
      createCreateCharacterModelTransaction: {
        tx: createCreateCharacterModelTransaction,
        characterModel: characterModelAddress,
      },
    } = await client.createCreateCharacterModelTransaction({
      config: {
        kind: "Wrapped",
        criterias: [
          {
            kind: "Collection",
            params: mplCore.group.toString(),
          },
        ],
      },
      project: project.address,
      authority: adminKeypair.publicKey.toString(),
      payer: adminKeypair.publicKey.toString(),
      cooldown: {
        ejection: 0,
      },
    });

    await sendTransaction(
      createCreateCharacterModelTransaction,
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

    const mints = mplCore.mints.map((x) => x.toString());
    const { createWrapAssetsToCharacterTransactions } =
      await client.createWrapAssetsToCharacterTransactions({
        project: project.address,
        characterModel: characterModel.address,
        wallet: userKeypair.publicKey.toString(),
        mintList: mints,
      });

    await sendTransactions(
      createWrapAssetsToCharacterTransactions,
      [userKeypair],
      "createWrapAssetsToCharacterTransactions"
    );

    character = await client
      .findCharacters({
        mints,
      })
      .then((res) => res.character[0]);
    expect(character).toBeTruthy();
    expect(character.usedBy.kind).toBe("None");
  });

  it("Use Character", async () => {
    const { createUseCharacterTransaction: txResponse } =
      await client.createUseCharacterTransaction({
        data: {
          status: "Idle",
        },
        character: character.address,
        project: project.address,
        characterModel: characterModel.address,
        user: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createUseCharacterTransaction"
    );

    await wait(10);

    const characterAfter = await client
      .findCharacters({
        addresses: [character.address],
      })
      .then((res) => res.character[0]);
    expect(characterAfter.usedBy.kind).toBe("Custom");
    characterAfter.usedBy.params &&
      "data" in characterAfter.usedBy.params &&
      expect(characterAfter.usedBy.params.data.status).toBe("Idle");
  });

  it("Use Character with different params", async () => {
    const { createUseCharacterTransaction: txResponse } =
      await client.createUseCharacterTransaction({
        data: {
          status: "InBattle",
        },
        character: character.address,
        project: project.address,
        characterModel: characterModel.address,
        user: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createUseCharacterTransaction"
    );

    await wait(10);

    const characterAfter = await client
      .findCharacters({
        addresses: [character.address],
      })
      .then((res) => res.character[0]);
    expect(characterAfter.usedBy.kind).toBe("Custom");
    characterAfter.usedBy.params &&
      "data" in characterAfter.usedBy.params &&
      expect(characterAfter.usedBy.params.data.status).toBe("InBattle");
  });

  it("Unuse Character", async () => {
    const { createUseCharacterTransaction: txResponse } =
      await client.createUseCharacterTransaction({
        unUse: true,
        character: character.address,
        project: project.address,
        characterModel: characterModel.address,
        user: adminKeypair.publicKey.toString(),
        payer: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createUseCharacterTransaction"
    );

    await wait(10);

    const characterAfter = await client
      .findCharacters({
        addresses: [character.address],
      })
      .then((res) => res.character[0]);
    expect(characterAfter.usedBy.kind).toBe("None");
  });
});
