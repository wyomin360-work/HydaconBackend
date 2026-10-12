# EC2 + Docker Compose + GitHub Actions Deployment Checklist

A step-by-step guide for hosting a Dockerized backend on one Amazon EC2 instance, storing images in Amazon ECR, deploying with GitHub Actions and AWS Systems Manager, and running Redis with Docker Compose.

This guide records the Hydacon setup as of **2026-10-12**. Values marked **current** are known from this setup; values in angle brackets are examples to replace. Never put passwords, private keys, or AWS access keys in this guide or in Git.

## 1. Plan the deployment

- [ ] Choose the AWS Region. Hydacon uses **Asia Pacific (Mumbai), `ap-south-1`**.
- [ ] Choose the production Git branch. Hydacon deploys from **`production`**.
- [ ] Decide how users will reach the API. Hydacon Compose currently binds port 5000 to `127.0.0.1` on EC2, so the API is not directly public. Add a reverse proxy or load balancer and HTTPS before serving users publicly.
- [ ] Decide where durable data lives. This setup keeps BullMQ's Redis data in a named Docker volume on the EC2 instance; it is not a highly available or off-instance Redis service.

## 2. Create and secure the EC2 instance

- [x] Create an EC2 instance. Hydacon uses Amazon Linux 2023, `x86_64`, in `ap-south-1`.
- [x] Record the instance ID. Hydacon: `i-03c47e62940dbdaa0`.
- [ ] Use a security group that allows SSH (TCP 22) only from your current IP. Do not open Redis port 6379 to the internet.
- [ ] For public API access, allow only the ports required by your chosen public entry point (normally 80/443 to a proxy or load balancer). Do not open port 5000 if the Compose file keeps its loopback binding.
- [ ] Consider an Elastic IP or load balancer plus DNS if a stable public address is required. An EC2 public IPv4 can change when the instance is stopped and started.
- [ ] Keep the SSH private key on your computer only. Set restrictive permissions once:

  ```bash
  chmod 400 /path/to/hydacon_ec2_key.pem
  ```

- [ ] Connect from your computer, replacing the host with the current public DNS name or IP:

  ```bash
  ssh -i /path/to/hydacon_ec2_key.pem ec2-user@<EC2-PUBLIC-DNS-OR-IP>
  ```

## 3. Attach the EC2 instance role

Attach an IAM role to the EC2 instance; do not store IAM access keys on the instance.

- [x] Hydacon role: `HydaconEc2Role`.
- [x] Allow the instance to pull images from ECR (Hydacon uses `AmazonEC2ContainerRegistryReadOnly`).
- [x] Allow Systems Manager management (Hydacon uses `AmazonSSMManagedInstanceCore`). The instance appears as a managed node.
- [x] Allow Docker to write container logs to CloudWatch. The inline policy is scoped to the Hydacon log group:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        "Resource": "arn:aws:logs:ap-south-1:743422351562:log-group:/hydacon/production:*"
      }
    ]
  }
  ```

- [ ] From the EC2 shell, verify that the instance role is active:

  ```bash
  aws sts get-caller-identity
  ```

  The ARN should identify an assumed `HydaconEc2Role` session. This command prints the active AWS identity, not access keys.

## 4. Install Docker and Compose on EC2

Amazon Linux 2023 uses `dnf`. If Docker is not already installed:

```bash
sudo dnf install -y docker
sudo systemctl enable --now docker
```

`dnf install` installs Docker from the AL2023 package repositories. `systemctl enable --now` starts Docker now and on future boots.

Hydacon's EC2 architecture is `x86_64`. Docker Compose is installed as a system-wide CLI plugin so both `ec2-user` and the root user used by Systems Manager can run it. The manually installed plugin does not auto-update; update it deliberately using Docker's current instructions.

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/download/v5.6.0/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
sudo docker compose version
```

- [x] Hydacon Compose plugin installed; both version commands should succeed.
- [ ] Confirm Docker starts after reboot: `sudo systemctl is-enabled docker`.

## 5. Create the ECR repository

- [ ] Create an ECR repository in the same Region as the instance. Hydacon target repository name: **`hydacon-server`**. The earlier repository was named `production`.
- [x] Registry URI: `743422351562.dkr.ecr.ap-south-1.amazonaws.com`.
- [ ] Keep the repository private. The EC2 role needs pull access; the GitHub deploy role needs push access to `hydacon-server`.
- [ ] Prefer immutable commit-SHA image tags for deployments. Hydacon tags the image with `${{ github.sha }}` rather than relying on a mutable `latest` tag.

## 6. Configure the backend for Redis

The app reads `REDIS_URL`. In Compose, the backend must use the service hostname `redis`, not `localhost` or the EC2 public address.

- [x] Production URL format in the local production env file: `redis://:<password>@redis:6379`.
- [x] Development URL format: `redis://:<password>@127.0.0.1:6379` (for a Redis process running on the developer's own machine).
- [x] Compose passes `REDIS_PASSWORD` to Redis and enables password authentication.
- [x] Redis append-only persistence is enabled and `/data` is mounted to the named volume `hydacon_redis_data`.
- [ ] Ensure the development Redis service is configured with the same development password as its `REDIS_URL`.
- [ ] Copy the production env file to EC2 securely. From your computer, run this from the repository root and replace the key path and host:

  ```bash
  scp -i /path/to/hydacon_ec2_key.pem env/.env.production ec2-user@<EC2-PUBLIC-DNS-OR-IP>:/home/ec2-user/hydacon.env
  ```

  Then, in the EC2 shell:

  ```bash
  sudo install -d -o root -g root -m 750 /opt/hydacon
  sudo install -o root -g root -m 600 /home/ec2-user/hydacon.env /opt/hydacon/.env
  rm -f /home/ec2-user/hydacon.env
  sudo stat -c '%U:%G %a %n' /opt/hydacon/.env
  ```

  `install` places the file where Compose expects it and limits access to root. The final command should show `root:root 600`. Do not use `cat` to paste the file into chat or GitHub.

- [ ] Check that required keys exist without displaying their values:

  ```bash
  sudo awk -F= '/^(REDIS_PASSWORD|REDIS_URL)=/ {print $1 " is set"}' /opt/hydacon/.env
  ```

## 7. Set up CloudWatch Logs

Hydacon uses Docker's `awslogs` driver. It sends each container's stdout and stderr through the EC2 role to CloudWatch. This is simpler for a single AWS host than operating Grafana and Loki on that same host.

- [x] In `ap-south-1`, create the CloudWatch log group **`/hydacon/production`**.
- [x] Set log retention to **30 days** to avoid indefinite storage by default.
- [x] Attach the scoped log-write policy from Step 3 to the **EC2 role**, not the GitHub role.
- [x] Compose writes separate streams named `hydacon-api` and `hydacon-redis`.
- [ ] After deployment, check **CloudWatch → Logs → Log groups → `/hydacon/production`**.

## 8. Configure GitHub Actions OIDC and permissions

OIDC lets GitHub Actions assume a short-lived AWS role. Do not store static AWS access keys in GitHub secrets.

- [x] Create the IAM OIDC provider for `token.actions.githubusercontent.com`.
- [x] Create the GitHub deployment role, restricted to the Hydacon repository's `production` branch.
- [x] Give that role the permissions needed to push to the `production` ECR repository and send/wait for Systems Manager commands to the intended EC2 instance.
- [x] The workflow requests `id-token: write` and assumes this role.
- [ ] In GitHub **Settings → Secrets and variables → Actions**, verify these repository secrets (values shown here are known for this setup):

  | Secret | Hydacon value / source |
  | --- | --- |
  | `AWS_REGION` | `ap-south-1` |
  | `AWS_ALLOWED_ACCOUNT_IDS` | `743422351562` |
  | `ECR_REGISTRY` | `743422351562.dkr.ecr.ap-south-1.amazonaws.com` (registry only, no `/production`) |
  | `EC2_INSTANCE_ID` | `i-03c47e62940dbdaa0` |
  | `AWS_ROLE_TO_ASSUME` | Copy the full role ARN for `HydaconGitHubActionsProductionRole` from IAM → Roles. |

  `ECR_REPOSITORY` is set to `hydacon-server` in the workflow, so it is not a secret.

## 9. Review the Docker and Compose files

- [x] [Dockerfile](../Dockerfile) builds the Node.js API using Yarn and exposes container port 5000.
- [x] [Compose production file](../docker-compose/compose.prod.yaml) defines `api` and `redis`, waits for Redis health, persists Redis data, and sends both services' logs to CloudWatch.
- [x] The API binds to `127.0.0.1:5000` on the EC2 host. This deliberately keeps it private until a reverse proxy or load balancer is configured.
- [x] `.dockerignore` excludes env files from Docker build context.
- [ ] Never commit env files or passwords. The env files are ignored and removed from the current repository snapshot, but older Git history may still contain earlier versions. Rotate any credentials that were ever pushed; deleting a file in a later commit does not remove it from history.
- [ ] Do not run `docker compose down -v` in production. `-v` removes the named Redis data volume.

## 10. Understand the deployment workflow

The production workflow is `.github/workflows/deploy-prod.yml`.

1. A push to `production` starts the workflow.
2. GitHub Actions assumes the AWS deploy role through OIDC.
3. Docker Buildx builds the image and pushes it to ECR with the commit SHA as its tag.
4. The workflow sends an `AWS-RunShellScript` command to EC2 through Systems Manager.
5. The EC2 role authenticates to ECR, and the SSM script writes the checked-in Compose file to `/opt/hydacon/compose.prod.yaml`.
6. Compose validates its settings, pulls the API image for that commit, then runs or updates the API and Redis services.

- [ ] Ensure production deploys wait for passing tests. The separate CI workflow runs tests on pushes, but separate workflows do not automatically depend on each other. In the current local workflow edit, the deploy workflow's `test` job is commented out. Either restore a same-workflow `needs: test` job or protect `production` with a required CI status check before treating this as a release gate.
- [ ] Review the current local diff before committing or pushing; do not accidentally include unrelated changes.

## 11. Deploy and verify

Before pushing to `production`, confirm:

- [ ] Compose works as both `ec2-user` and root on EC2.
- [ ] `/opt/hydacon/.env` exists, is root-owned mode 600, and has the correct production `REDIS_URL` and `REDIS_PASSWORD`.
- [ ] CloudWatch log group and EC2 role permissions are in place.
- [ ] GitHub Actions secrets and OIDC role trust are correct.
- [ ] CI passes and branch protection prevents a failed CI run from deploying.
- [ ] Public access is configured separately if the API should be internet-reachable.

Push to `production` only after these are ready; the push triggers deployment. In GitHub, inspect **Actions → Deploy production**. A green workflow means the SSM command completed successfully, but still check the app:

```bash
docker compose --env-file /opt/hydacon/.env -f /opt/hydacon/compose.prod.yaml ps
docker compose --env-file /opt/hydacon/.env -f /opt/hydacon/compose.prod.yaml logs --tail=100 api redis
curl -i http://127.0.0.1:5000/health
```

`ps` shows container state, `logs` shows recent API/Redis output, and `/health` should return HTTP 200 when the backend's database connection is healthy.

## 12. Troubleshoot an SSM deployment failure

The AWS CLI waiter can report only that SSM ended in `Failed`; it may not include the command's useful stderr. Use the command ID printed in the GitHub Actions log.

- [ ] In AWS, open **Systems Manager → Run Command → Command history**, select the command ID, and inspect the instance invocation's Standard output and Standard error.
- [ ] Or, from a computer with AWS CLI credentials permitted to read SSM output, run:

  ```bash
  aws ssm get-command-invocation \
    --region ap-south-1 \
    --command-id <SSM-COMMAND-ID> \
    --instance-id i-03c47e62940dbdaa0 \
    --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
    --output json
  ```

- [ ] Check common causes: missing `/opt/hydacon/.env`, Compose unavailable to root/SSM, incorrect GitHub role permissions, ECR pull denial, missing CloudWatch log group or permissions, and an unhealthy API/database connection.
- [ ] Do not paste env contents, Redis passwords, AWS tokens, or private keys into an issue or chat.

## 13. Production limitations to plan for

- [ ] Redis and the API share one EC2 instance. An EC2 failure takes down both; a local named volume is not a backup. Plan EBS snapshots/off-instance backups and a tested restore procedure.
- [ ] Set resource monitoring and alarms for EC2 memory, CPU, disk, and CloudWatch log ingestion. CloudWatch container logs alone are not a complete metrics or alerting setup.
- [ ] Set up a public entry point, domain, and TLS if required. Port 5000 is currently bound to EC2 loopback only.
- [ ] Consider managed Redis (Amazon ElastiCache) if queue availability or Redis recovery becomes a production requirement.

## References

- [Docker Compose plugin installation](https://docs.docker.com/compose/install/linux/)
- [Docker `awslogs` logging driver](https://docs.docker.com/engine/logging/drivers/awslogs/)
- [Amazon CloudWatch Logs log groups and retention](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html)
- [AWS Systems Manager Run Command](https://docs.aws.amazon.com/systems-manager/latest/userguide/run-command.html)
