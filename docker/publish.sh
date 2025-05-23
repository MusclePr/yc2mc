#!/bin/bash
source .env
docker compose build ${BUILD_TARGET}
