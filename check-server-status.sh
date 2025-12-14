#!/bin/bash
# Quick script to check server status after deployment
# Run this on your VPS to verify all services are running

echo "=== Checking Docker Containers ==="
docker ps -a

echo -e "\n=== Checking Central Services ==="
docker ps -a | grep central

echo -e "\n=== Checking Pact Dashboard ==="
docker ps -a | grep pact_dashboard

echo -e "\n=== Checking Docker Networks ==="
docker network ls

echo -e "\n=== Disk Usage ==="
df -h

echo -e "\n=== Recent Docker Events (last 50) ==="
docker events --since 10m --until 0s 2>/dev/null || echo "No recent events"

