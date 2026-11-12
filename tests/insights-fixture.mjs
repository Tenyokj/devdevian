import assert from "node:assert/strict";
import { openDatabase } from "../database.mjs";
export async function seedInsights(f) {
  const a = f.client(),
    b = f.client(),
    member = f.client();
  const people = [];
  for (const [client, name] of [
    [a, "Insight Author"],
    [b, "Another Developer"],
    [member, "Community Member"],
  ]) {
    const r = await client("/register", {
      name,
      email: name.replaceAll(" ", "").toLowerCase() + "@insights.test",
      password: "Fixture-password123",
    });
    assert.equal(r.status, 200);
    people.push(r.data.user.id);
  }
  const [id, other, memberId] = people;
  const group = (
    await a("/communities", {
      name: "Private stats boundary",
      description: "Private context for statistics isolation tests.",
    })
  ).data;
  const db = await openDatabase({
    DB_PATH: f.path,
    DB_DRIVER: process.env.DB_DRIVER,
  });
  const today = new Date().toISOString().slice(0, 10) + " 10:00:00",
    older = new Date(Date.now() - 40 * 86400000).toISOString();
  const post = (
    user,
    title,
    kind = "discussion",
    community = null,
    created = today,
  ) =>
    Number(
      db
        .prepare(
          "INSERT INTO posts(user_id,title,body,kind,topic,community_id,created,stack) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          user,
          title,
          "Synthetic retained content for statistics.",
          kind,
          "web",
          community,
          created,
          "TypeScript, Node.js, TypeScript",
        ).lastInsertRowid,
    );
  const publicId = post(id, "Public conversation", "question"),
    reviewId = post(id, "Public code review", "review"),
    oldId = post(id, "An older conversation", "discussion", null, older),
    privateId = post(id, "Secret project conversation", "question", group.id),
    removedId = post(id, "Removed conversation");
  db.prepare("UPDATE posts SET removed_at=CURRENT_TIMESTAMP WHERE id=?").run(
    removedId,
  );
  const otherPost = post(other, "Another developer question", "question");
  const reply = (postId, user = id) =>
    Number(
      db
        .prepare(
          "INSERT INTO replies(user_id,post_id,body,created) VALUES(?,?,?,?)",
        )
        .run(user, postId, "Synthetic answer.", today).lastInsertRowid,
    );
  const accepted = reply(otherPost);
  db.prepare(
    "UPDATE posts SET accepted_reply_id=?,status='resolved' WHERE id=?",
  ).run(accepted, otherPost);
  reply(publicId);
  reply(privateId);
  const deleted = reply(publicId);
  db.prepare(
    "INSERT INTO entity_details(kind,entity_id,data) VALUES('reply',?,?)",
  ).run(String(deleted), JSON.stringify({ deleted_at: today }));
  const remark = Number(
    db
      .prepare(
        "INSERT INTO code_reviews(post_id,user_id,snippet_hash,start_line,end_line,quote,body,created) VALUES(?,?,?,1,1,?,?,?)",
      )
      .run(reviewId, id, "fixture-hash", "code", "A retained remark.", today)
      .lastInsertRowid,
  );
  db.prepare(
    "INSERT INTO code_review_replies(review_id,user_id,body,created) VALUES(?,?,?,?)",
  ).run(remark, id, "A feedback reply.", today);
  const project = (postId, name) =>
    Number(
      db
        .prepare(
          "INSERT INTO projects(user_id,post_id,name,description,topic,stage,help,created) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          postId,
          name,
          "A synthetic project.",
          "web",
          "Prototype",
          "Testing contributions",
          today,
        ).lastInsertRowid,
    );
  const publicProject = project(publicId, "Public Project"),
    privateProject = project(privateId, "Secret Project");
  const task = post(other, "Public project task", "review");
  db.prepare(
    "INSERT INTO project_work_requests(project_id,post_id,state,linked,version,created_by,created,updated_at) VALUES(?,?,'ready',1,1,?, ?,?)",
  ).run(publicProject, task, id, today, today);
  db.prepare(
    "INSERT INTO room_assignments(post_id,project_id,user_id) VALUES(?,?,?)",
  ).run(task, publicProject, id);
  db.prepare(
    "INSERT INTO contributions(project_id,post_id,user_id,state,version,revision,created) VALUES(?,?,?,'accepted',1,1,?)",
  ).run(publicProject, task, id, today);
  db.prepare(
    "INSERT INTO memberships(user_id,kind,item) VALUES(?,'group',?)",
  ).run(memberId, group.id);
  db.prepare(
    "INSERT INTO memberships(user_id,kind,item) VALUES(?,'post',?)",
  ).run(id, String(publicId));
  db.prepare(
    "INSERT INTO subscriptions(user_id,kind,item) VALUES(?,'post',?)",
  ).run(id, String(publicId));
  db.close();
  return {
    a,
    b,
    member,
    id,
    other,
    group,
    publicId,
    privateId,
    publicProject,
    privateProject,
    oldId,
  };
}
