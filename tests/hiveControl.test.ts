import base58 from "bs58";
import nacl from "tweetnacl";
import {
  BadgesCondition,
  HiveControlPermissionInput,
  Profile,
  Project,
  User,
} from "@honeycomb-protocol/edge-client";
import {
  adminKeypair,
  authorize,
  client,
  sendTransaction,
  userKeypair,
  log,
} from "../utils";

describe("Test Hive Control Actions", () => {
  let user: User;
  let accessToken: string;
  // let projectAddress: string = "CgzNiZjfb8FiTEGqPsYfk9PaTxusxzRmRNBmsanDbsLD";
  let projectAddress: string;
  let project: Project;
  let profile: Profile;

  const userInfo = {
    username: "hcDev",
    name: "Honeycomb Developer",
    bio: "This user is created for testing purposes",
    pfp: "n/a",
  };

  const profileInfo = {
    name: `(Profile) ${userInfo.name}`,
    bio: `This is profile of ${userInfo.username}`,
    pfp: "https://lh3.googleusercontent.com/-Jsm7S8BHy4nOzrw2f5AryUgp9Fym2buUOkkxgNplGCddTkiKBXPLRytTMXBXwGcHuRr06EvJStmkHj-9JeTfmHsnT0prHg5Mhg",
  };

  it("Creates/Loads User", async () => {
    userInfo.username = userKeypair.publicKey.toString();
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

      await client
        .findUsers({
          wallets: [userKeypair.publicKey.toString()],
        })
        .then(({ user: [userT] }) => (user = userT));
    }

    expect(user).toBeTruthy();
    accessToken = await authorize(userKeypair);
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
        txResponse,
        [adminKeypair],
        "createCreateProjectTransaction"
      );

      projectAddress = projectAddressT;
    }
    log("projectAddress", projectAddress);
    project = await client
      .findProjects({ addresses: [projectAddress] })
      .then((res) => res.project[0]);
    expect(project).toBeTruthy();
  });

  it.skip("Change Project Driver", async () => {
    const { createChangeProjectDriverTransaction: txResponse } =
      await client.createChangeProjectDriverTransaction({
        project: project.address,
        driver: userKeypair.publicKey.toString(),
        authority: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createChangeProjectDriverTransaction"
    );

    await client
      .findProjects({
        addresses: [project.address],
      })
      .then(({ project: [projectT] }) => (project = projectT));

    expect(project).toBeTruthy();
    expect(project.driver).toBe(userKeypair.publicKey.toString());
  });

  it.skip("Create Project Delegate Authority", async () => {
    const { createCreateDelegateAuthorityTransaction: txResponse } =
      await client.createCreateDelegateAuthorityTransaction({
        project: project.address,
        delegate: userKeypair.publicKey.toString(),
        serviceDelegations: {
          HiveControl: [
            {
              permission: HiveControlPermissionInput.ManageServices,
            },
          ],
        },
        authority: adminKeypair.publicKey.toString(),
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createCreateDelegateAuthorityTransaction"
    );

    await client
      .findProjects({
        addresses: [project.address],
      })
      .then(({ project: [projectT] }) => (project = projectT));

    expect(project).toBeTruthy();
    expect(project.authority).toBe(adminKeypair.publicKey.toString());
  });

  it.skip("Modify Project Delegate Authority", async () => {
    const { createModifyDelegationTransaction: txResponse } =
      await client.createModifyDelegationTransaction({
        project: project.address,
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
      txResponse,
      [adminKeypair],
      "createCreateDelegateAuthorityTransaction"
    );

    await client
      .findProjects({
        addresses: [project.address],
      })
      .then(({ project: [projectT] }) => (project = projectT));

    expect(project).toBeTruthy();
    expect(project.authority).toBe(adminKeypair.publicKey.toString());
  });

  it("Creates/Loads Profiles Tree", async () => {
    if (!project.profileTrees.merkle_trees[project.profileTrees.active]) {
      const {
        createCreateProfilesTreeTransaction: { tx: txResponse },
      } = await client.createCreateProfilesTreeTransaction({
        treeConfig: {
          advanced: {
            maxDepth: 3,
            maxBufferSize: 8,
            canopyDepth: 3,
          },
        },
        project: project.address,
        payer: adminKeypair.publicKey.toString(),
      });

      await sendTransaction(
        txResponse,
        [adminKeypair],
        "createCreateProfilesTreeTransaction"
      );

      await client
        .findProjects({
          addresses: [project.address],
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
          payer: userKeypair.publicKey.toString(),
          wallet: userKeypair.publicKey.toString(),
          project: project.address,
        });

      await sendTransaction(
        txResponse,
        [userKeypair],
        "createNewUserTransaction"
      );

      await client
        .findUsers({
          wallets: [userKeypair.publicKey.toString()],
        })
        .then(({ user: [userT] }) => (user = userT));

      const {
        authRequest: { message: authRequest },
      } = await client.authRequest({
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
    if (!accessToken) accessToken = await authorize(userKeypair);

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
          projects: [projectAddress],
        })
        .then(({ profile: [profileT] }) => (profile = profileT));
    }

    log("Profile Id", profile.address);

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
          profile: profile.address,
          info: {
            name,
          },
          customData: {
            add: {
              customField: ["customValue"],
            },
          },
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
      "createUpdateProfileTransaction"
    );

    await client
      .findProfiles({
        userIds: [user.id],
        projects: [projectAddress],
      })
      .then(({ profile: [profileT] }) => (profile = profileT));

    expect(profile).toBeTruthy();
    expect(profile.info.name).toBe(name);
    expect(profile.customData?.customField[0]).toBe("customValue");
  });

  it("Update Social Info", async () => {
    const { createUpdateUserTransaction: txResponse } =
      await client.createUpdateUserTransaction(
        {
          payer: userKeypair.publicKey.toString(),
          populateCivic: true,
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

    await sendTransaction(txResponse, [userKeypair], "Update Social Info");

    await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [userT] }) => (user = userT));

    expect(user).toBeTruthy();
    expect(user.info.username).toBe(userInfo.username);
  });

  it("Update User Info", async () => {
    const { createUpdateUserTransaction: txResponse } =
      await client.createUpdateUserTransaction(
        {
          info: { bio: "Updated test bio" },
          payer: userKeypair.publicKey.toString(),
          wallets: {
            remove: user.wallets.wallets.slice(1),
          },
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

    await sendTransaction(txResponse, [userKeypair], "Update User Info");

    await client
      .findUsers({
        wallets: [userKeypair.publicKey.toString()],
      })
      .then(({ user: [userT] }) => (user = userT));

    expect(user).toBeTruthy();
    expect(user.info.username).toBe(userInfo.username);
  });

  it("Update Profile Load Test", async () => {
    log("profile.address", profile.address);
    const name = user.info.name + "_profile";
    {
      const { createUpdateProfileTransaction: txResponse } =
        await client.createUpdateProfileTransaction(
          {
            profile: profile.address,
            info: {
              name,
            },
            customData: {
              add: {
                country: ["DZ"],
              },
            },
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
        "createUpdateProfileTransaction"
      );
    }

    {
      const { createUpdateProfileTransaction: txResponse } =
        await client.createUpdateProfileTransaction(
          {
            profile: profile.address,
            customData: {
              add: {
                discord: ["533008725158658069"],
              },
            },
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
        "createUpdateProfileTransaction"
      );
    }

    {
      const { createUpdateProfileTransaction: txResponse } =
        await client.createUpdateProfileTransaction(
          {
            profile: profile.address,
            customData: {
              add: {
                background: ["Glacier Purple", false, false, true],
              },
            },
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
        "createUpdateProfileTransaction"
      );
    }

    {
      const { createUpdateProfileTransaction: txResponse } =
        await client.createUpdateProfileTransaction(
          {
            profile: profile.address,
            customData: {
              add: {
                country: ["DZB"],
              },
            },
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
        "createUpdateProfileTransaction"
      );
    }

    {
      const { createUpdateProfileTransaction: txResponse } =
        await client.createUpdateProfileTransaction(
          {
            profile: profile.address,
            customData: {
              add: {
                country: ["DZE"],
              },
            },
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
        "createUpdateProfileTransaction"
      );
    }

    await client
      .findProfiles({
        userIds: [user.id],
        projects: [projectAddress],
      })
      .then(({ profile: [profileT] }) => (profile = profileT));

    expect(profile).toBeTruthy();
    expect(profile.info.name).toBe(name);
    // expect(profile.customData.customField[0]).toBe("customValue");
  });

  it("Creates/Loads Badge Criteria", async () => {
    const { createInitializeBadgeCriteriaTransaction: txResponse } =
      await client.createInitializeBadgeCriteriaTransaction({
        args: {
          authority: adminKeypair.publicKey.toString(),
          projectAddress,
          endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
          startTime: Math.floor(Date.now() / 1000),
          badgeIndex: 0,
          payer: adminKeypair.publicKey.toString(),
          condition: BadgesCondition.Public,
        },
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createInitializeBadgeCriteriaTransaction"
    );

    project = await client
      .findProjects({ addresses: [projectAddress] })
      .then((res) => res.project[0]);

    expect(project.badgeCriteria?.[0]).toBeTruthy();
  });

  it("Claim Badge Criteria", async () => {
    const { createClaimBadgeCriteriaTransaction: txResponse } =
      await client.createClaimBadgeCriteriaTransaction({
        args: {
          criteriaIndex: 0,
          profileAddress: profile.address,
          projectAddress,
          proof: BadgesCondition.Public,
          payer: userKeypair.publicKey.toString(),
        },
      });

    await sendTransaction(
      txResponse,
      [userKeypair],
      "createClaimBadgeCriteriaTransaction"
    );

    profile = await client
      .findProfiles({ userIds: [profile.userId], projects: [projectAddress] })
      .then((res) => res.profile[0]);

    expect(profile.platformData.achievements).toBeTruthy();
  });

  it("Update Badge Criteria", async () => {
    const { createUpdateBadgeCriteriaTransaction: txResponse } =
      await client.createUpdateBadgeCriteriaTransaction({
        args: {
          authority: adminKeypair.publicKey.toString(),
          condition: BadgesCondition.Public,
          criteriaIndex: 0,
          projectAddress,
          endTime: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
          payer: adminKeypair.publicKey.toString(),
          startTime: Math.floor(Date.now() / 1000),
        },
      });

    await sendTransaction(
      txResponse,
      [adminKeypair],
      "createUpdateBadgeCriteriaTransaction"
    );

    project = await client
      .findProjects({ addresses: [projectAddress] })
      .then((res) => res.project[0]);

    expect(project.badgeCriteria?.[0]).toBeTruthy();
  });
});
