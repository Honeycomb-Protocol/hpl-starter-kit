import {
  AssemblerConfig,
  Character,
  CharacterModel,
  Project,
} from "@honeycomb-protocol/edge-client";
import {
  adminKeypair,
  client,
  connection,
  createAssemblerConfig,
  createCharacterModelRaw,
  createProject,
  sendTransaction,
  sendTransactions,
  userKeypair,
  wait
} from "../../../utils";
import { order, traits } from "./traits";

describe("Test Character Assembly and mint as MplCore", () => {
  let project: Project;
  let assemblerConfig: AssemblerConfig;
  let characterModel: CharacterModel;
  let character: Character;

  beforeAll(async () => {
    project = await createProject();

    assemblerConfig = await createAssemblerConfig(project, order, traits);

    characterModel = await createCharacterModelRaw(
      project,
      {
        kind: "Assembled",
        assemblerConfigInput: {
          assemblerConfig: assemblerConfig.address,
          name: "MplCore #0",
          symbol: "MPL_CORE",
          description: "Creating this MplCore Asset with assembler",
          creators: [
            {
              address: adminKeypair.publicKey.toString(),
              share: 100,
            },
          ],
          sellerFeeBasisPoints: 0,
          collectionName: "Collection",
        },
      },
      {
        maxDepth: 3,
        maxBufferSize: 8,
        canopyDepth: 3,
      }
    );
  });

  it("Assemble Character", async () => {
    const preBalance = await connection.getBalance(userKeypair.publicKey);

    const { createAssembleCharacterTransaction: txResponse } =
      await client.createAssembleCharacterTransaction({
        attributes: [
          ["Fur", "Black"],
          ["Eyes", "2 Tone"],
          ["Mouth", "Agitated"],
          ["Clothes", "Astronaut"],
        ],
        project: project.address,
        assemblerConfig: assemblerConfig.address,
        characterModel: characterModel.address,
        owner: userKeypair.publicKey.toString(),
        authority: adminKeypair.publicKey.toString(),
        lutAddresses: ["2hZXMmXFtKgEoZzjZu6g9NFVtx3J9BRXqE3ZXTrGGCxc"]
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createAssembleCharacterTransaction"
    );

    const postBalance = await connection.getBalance(userKeypair.publicKey);
    // expect(preBalance).toBe(postBalance);
    await wait(10);
    character = await client
      .findCharacters({
        trees: [
          characterModel.merkle_trees.merkle_trees[
            characterModel.merkle_trees.active
          ],
        ],
        wallets: [userKeypair.publicKey.toString()],
      })
      .then((res) => res.character[0] as Character);

    expect(character).toBeTruthy();
    // dirLog(character, { depth: null });
  });

  it("Update Character Traits", async () => {
    const preBalance = await connection.getBalance(userKeypair.publicKey);

    const { createUpdateCharacterTraitsTransaction: txResponse } =
      await client.createUpdateCharacterTraitsTransaction({
        characterAddress: character.address,
        attributes: [
          ["Fur", "Brown"],
          ["Eyes", "2 Tone"],
          ["Mouth", "Agitated"],
          ["Clothes", "Astronaut"],
        ],
        project: project.address,
        assemblerConfig: assemblerConfig.address,
        characterModel: characterModel.address,
        authority: adminKeypair.publicKey.toString(),
        lutAddresses: ["2hZXMmXFtKgEoZzjZu6g9NFVtx3J9BRXqE3ZXTrGGCxc"]
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createUpdateCharacterTraitsTransaction"
    );

    const postBalance = await connection.getBalance(userKeypair.publicKey);
    // expect(preBalance).toBe(postBalance);

    character = await client
      .findCharacters({
        trees: [
          characterModel.merkle_trees.merkle_trees[
            characterModel.merkle_trees.active
          ],
        ],
        wallets: [userKeypair.publicKey.toString()],
      })
      .then((res) => res.character[0] as Character);

    expect(character).toBeTruthy();
    // log("Character", character);
  });

  it("Unwrap Character", async () => {
    const preBalance = await connection.getBalance(userKeypair.publicKey);

    const { createUnwrapAssetsFromCharacterTransactions: txResponse } =
      await client.createUnwrapAssetsFromCharacterTransactions({
        characterAddresses: [character.address],
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

    character = await client
      .findCharacters({
        addresses: [character.address],
      })
      .then((res) => res.character[0] as Character);

    expect(character).toBeTruthy();
    // log("Character", character);
  });
});
