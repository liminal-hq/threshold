# Setting up GitHub Container Registry (GHCR) for CI

If the CI setup process (installing system dependencies) becomes too slow, you can use a pre-built Docker image hosted on GHCR.

## 1. Build and Push the Image

You can build the image using the existing `.devcontainer/Dockerfile`.

```bash
# Login to GHCR
echo $CR_PAT | docker login ghcr.io -u USERNAME --password-stdin

# Build the image
# Adjust the tag as necessary (e.g., latest or a specific version)
docker build -f .devcontainer/Dockerfile -t ghcr.io/<owner>/<repo>/ci-base:latest .

# Push the image
docker push ghcr.io/<owner>/<repo>/ci-base:latest
```

## 2. Maintaining the Image in GitHub Actions

The workflow is already maintained in `.github/workflows/build-ci-image.yml`. It is configured to be manually triggered (`workflow_dispatch`), but you can enable `push` triggers if desired.

Current implementation handles repository name casing correctly:

```yaml
name: Build and Push CI Image

on:
  workflow_dispatch:

jobs:
  build-and-push:
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Log in to the Container registry
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Lowercase Repository Name
        run: |
          echo "IMAGE_REPOSITORY=${GITHUB_REPOSITORY,,}" >> ${GITHUB_ENV}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: .devcontainer/Dockerfile
          push: true
          tags: ghcr.io/${{ env.IMAGE_REPOSITORY }}/ci-base:latest
```

## 3. Update the Test Workflow

Modify `.github/workflows/test.yml` to run inside the container.

```yaml
jobs:
  test:
    runs-on: ubuntu-24.04
    container:
      image: ghcr.io/<owner>/<repo>/ci-base:latest
      credentials:
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    steps:
      - uses: actions/checkout@v4

      # Skip "Install system dependencies" step as they are in the image

      # Continue with pnpm install and tests...
```

## 4. Permissions

Ensure the workflow has permission to read packages if the image is private.

```yaml
permissions:
  contents: read
  packages: read
```
