# Recovery Guide for Deleted Docker Containers

## Quick Recovery Steps (Run on Server)

SSH into your server and run these commands:

```bash
# 1. Check all containers (including stopped ones)
docker ps -a

# 2. Check if your central containers are stopped
docker ps -a | grep central

# 3. If containers are stopped, restart them
# Go to your central project directory first
cd /path/to/central  # Adjust path as needed
docker compose up -d

# 4. Check Docker images - see if any were deleted
docker images

# 5. Check what's currently running
docker ps
```

## If Central Containers Were Stopped

The deployment might have stopped your central containers if they shared a network. Check:

```bash
# List all Docker networks
docker network ls

# Check if containers are using the same network
docker inspect <container_name> | grep -A 10 Networks

# Restart your central services
cd /path/to/central-project
docker compose up -d
```

## Check What Files Were Deleted

```bash
# Check the deployment directory
ls -la $APP_DIR  # Replace with your actual APP_DIR

# Check if important files are missing
# (adjust paths based on what you had)
```

## Restore from Backup (if available)

If you have backups or the files are in git:

```bash
# Check git history if the deployment directory was a git repo
cd $APP_DIR
git log --oneline
git reflog  # Shows all actions including deletions
```

