# Moderation and community roles

## Two independent scopes

| Role | Where it applies | How it is assigned |
| --- | --- | --- |
| Community owner | Their community | Creates the community or receives ownership |
| Community validator | The specific community | Appointed by its owner through Manage access |
| Platform moderator | Public feed | Operator lists the account email in server-side `MODERATOR_EMAILS` |
| Ordinary member | No moderation privileges | Joining does not grant review rights |

Community moderation aggregates reports from communities you own or validate. It is not a view of every community on the forum. Platform moderation handles public-feed reports. A platform role alone does not grant access to another community’s private reports or attachments. A profile job title is descriptive, not an access role.

The sidebar shows each moderation entry only when applicable. Directly opening a route does not grant rights: the API checks the role and content scope. An ordinary member cannot read the queue or decide reports. Leaving a community or having a validator role removed revokes its access.

## Review a report

Open the relevant queue and review the report reason, publication, author, and community assignment. Decide whether to resolve or dismiss it and add a note of at least five characters. A resolution can also hide the publication or pause replies. A recorded decision without either action closes the report but leaves the publication visible and writable.

Dismissal records that no restriction is needed. An already-reviewed report cannot be silently overwritten. Decisions and content restrictions appear in an action log with the acting account, time, and reason. Hiding a publication is reversible by an authorized moderator; it is not a permanent database purge.

Archiving is an author action, distinct from a moderator pause or hide. Restoring an archive does not clear moderator restrictions.

## Membership requests

Owners and appointed validators review join requests for their community. Approving grants membership; dismissing does not. A pending request is not membership. Owners manage validator assignments and ownership. Members cannot appoint themselves validators by changing profile data or sending an API field.

## Platform setup

Set `MODERATOR_EMAILS` to the exact account email(s), separated by commas, in the server environment and redeploy. Use a small, trusted set of accounts. No email list means no platform moderators. This setting must remain server-side; the application has no self-service “become platform moderator” button.

## Reporting problems

For a moderation review, provide the publication URL and relevant context to its community owner or, for platform matters, **dv842449@gmail.com**. Do not copy private community contents into public GitHub issues. Report permission bypasses privately under [SECURITY.md](../SECURITY.md).
