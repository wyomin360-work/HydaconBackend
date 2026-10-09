# Automated MongoDB backups

The `MongoDB backup` GitHub Actions workflow runs daily at midnight India time and can also be started manually from the Actions tab. It creates a compressed `mongodump` archive, encrypts it with age, uploads it to Google Drive through rclone, and removes Drive backup files older than 30 days.

## GitHub configuration

In the repository, open **Settings → Secrets and variables → Actions** and add:

| Name                 | Type                | Value                                                                                     |
| -------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| `MONGODB_BACKUP_URI` | Repository secret   | MongoDB URI for a dedicated backup user with read-only access to the required database.   |
| `RCLONE_CONFIG_B64`  | Repository secret   | Base64-encoded rclone configuration file containing a Google Drive remote named `gdrive`. |
| `AGE_RECIPIENT`      | Repository variable | Public age recipient used to encrypt the archives.                                        |

Configure the `gdrive` remote locally with `rclone config`, then encode its config file without adding line breaks. For example, on macOS:

```sh
base64 < "$(rclone config file | tail -n 1)" | tr -d '\n'
```

Save that output directly as the `RCLONE_CONFIG_B64` secret. Do not commit the rclone config or database URI. Create an age key pair with `age-keygen`; store its public recipient in `AGE_RECIPIENT` and keep the private key offline for restores.

Allow the GitHub Actions runner to connect in the MongoDB network access configuration. Prefer a narrowly scoped backup database user, and avoid opening database access broadly when possible.

## Restore

Download an encrypted archive from Drive and decrypt it using the private age key:

```sh
age --decrypt --identity age-private-key.txt --output hydacon.archive.gz hydacon-backup.archive.gz.age
```

Then restore it into a test database first:

```sh
mongorestore --uri "$TEST_MONGODB_URI" --archive=hydacon.archive.gz --gzip
```

The workflow only backs up MongoDB data. Files stored separately in S3 or other object storage need their own backup policy.
