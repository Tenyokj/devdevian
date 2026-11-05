import React, { useEffect, useState } from "react";
import { Users, ShieldCheck, Eye } from "lucide-react";
import { api } from "./data";
import { ErrorMessage } from "./ui";
import { FlowDialog } from "./review-flow";
export function ProjectParticipation({ project, user, onChange }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [edit, setEdit] = useState(false),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    api(`/projects/${project.id}/participation`, { signal: c.signal })
      .then((d) => {
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [project.id, user?.id, epoch]);
  if (!data) return error ? <ErrorMessage error={error} /> : null;
  const approved = data.mode === "approved";
  return (
    <section
      className="project-participation"
      aria-label="Project participation"
    >
      <div className="participation-icon">
        {approved ? <ShieldCheck size={20} /> : <Users size={20} />}
      </div>
      <div>
        <h3>{approved ? "Approved contributors" : "Open participation"}</h3>
        <p>
          {approved
            ? "Everyone with project access can observe. Only approved contributors can join the work."
            : "Anyone with project access can participate and pick up an available task."}
        </p>
        {approved && !data.can_participate && user && (
          <small>
            <Eye size={13} /> You have observer access. Ask the owner to approve
            you.
          </small>
        )}
        {data.can_manage && (
          <small>
            Visibility and community membership are separate. Team credits do
            not grant participation.
          </small>
        )}
      </div>
      {data.can_manage && (
        <button className="button secondary" onClick={() => setEdit(true)}>
          Manage participation
        </button>
      )}
      {edit && (
        <FlowDialog
          close={() => {
            setEdit(false);
            setEpoch((n) => n + 1);
          }}
          done={() => {
            setEdit(false);
            setEpoch((n) => n + 1);
            onChange?.();
          }}
          plan={{
            title: "Manage project participation",
            context:
              "Approval does not grant private community access. Removing someone releases their active tasks and stops new participation; existing work and history remain. The owner is always allowed. Leave the list blank for owner-only participation.",
            audience: project.community_id
              ? "Current community members"
              : "Project viewers",
            url: `/projects/${project.id}/participation`,
            method: "PUT",
            payload: { expected_version: data.version },
            values: {
              mode: data.mode,
              members: data.members.map((u) => "@" + u.username).join("\n"),
            },
            fields: [
              {
                key: "mode",
                label: "Participation mode",
                options: [
                  ["open", "Open participation"],
                  ["approved", "Approved contributors only"],
                ],
              },
              {
                key: "members",
                label: "Approved usernames (one per line)",
                multiline: true,
                max: 3200,
              },
            ],
            transform: (v) => ({
              mode: v.mode,
              members: v.members.split(/[\s,]+/).filter(Boolean),
            }),
          }}
        />
      )}
    </section>
  );
}
