# Run and host Runline

## Run locally

Install Git, Docker, and the Docker Compose plugin. From a terminal, run:

```sh
git clone https://github.com/domnatz/runline.git
cd runline
docker compose up --build --wait
```

Open [Runline](http://localhost:3000/login). The [service-call walkthrough](../README.md#walk-through-a-service-call) uses the sample records loaded at startup.

| Task | Command |
| --- | --- |
| Rebuild and start the app | `docker compose up --build --wait` |
| Follow service logs | `docker compose logs -f web api worker` |
| Rerun migrations and seeds | `docker compose run --rm migrate` |

## Host a reviewer instance

Create an A record for a dedicated subdomain pointing to the VPS public IPv4 address. Check that the record resolves before starting Caddy:

```sh
nslookup runline.example.com 1.1.1.1
```

Allow inbound TCP ports 80 and 443 in the VPS firewall. Install Docker with Compose 2.24.4 or newer, Bash, and OpenSSL. On the VPS, check who owns the HTTP and HTTPS ports:

```sh
sudo ss -ltnp '( sport = :80 or sport = :443 )'
```

The bundled Caddy service uses both ports. If the VPS already has a reverse proxy on them, configure the subdomain and HTTPS through that proxy before starting Runline on the shared host.

For the bundled Caddy setup, clone the repository on the VPS, enter its directory, and replace the example hostname with your own:

```sh
bash deploy/reviewer.sh init runline.example.com
bash deploy/reviewer.sh up
```

Caddy provisions HTTPS and opens Runline's sign-in page to visitors. Anyone can choose one of the sample roles and change the shared sample data. Use synthetic records and keep the reviewer environment file private. On an existing installation, keep that file and run `bash deploy/reviewer.sh up` after updating the checkout.

From outside the VPS, check the HTTP redirect and HTTPS response.

```sh
curl -I http://runline.example.com/login
curl -I https://runline.example.com/login
```

Expect an HTTP redirect and an HTTPS `200` on the sign-in page. Then choose a sample role in the browser and run the service-call walkthrough.

| Task | Command |
| --- | --- |
| Back up the database, PDFs, and queue during a short maintenance window | `bash deploy/reviewer.sh backup` |
| Start a fresh set of sample records | `bash deploy/reviewer.sh reset` |
| Restore a backup into a fresh dataset | `bash deploy/reviewer.sh restore <backup-directory>` |
| Follow proxy and app logs | `docker compose -p runline-reviewer --env-file .local/reviewer/runline-reviewer.env -f compose.yaml -f compose.reviewer.yaml logs -f caddy web api worker` |

Copy completed backups and the reviewer environment file to protected off-server storage. Restore using the same release, container architecture, and environment credentials. Reset and restore switch to fresh data volumes and expire existing browser sessions and tracking links. Older volumes remain available for recovery.
