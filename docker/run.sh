#!/bin/bash
trap 'docker compose down' INT TERM
docker compose up ${1} && docker compose down
