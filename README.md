# N8N License server

# Disclaimer: Usage is intended for educational purposes only!

## Instructions:
 - Pull code
 - `docker build . -t n8n-license-server`
 - Deploy to k8 or run `docker run -p 3000:3000 n8n-license-server`
 - Patch official n8n docker image (see below)
 - Set *ENV* variable `N8N_LICENSE_SERVER_URL` to the fake license server, for example: `http://localhost:3000/v1` or `http://n8n-license.cluster.local:3000/v1`

## Patching N8N docker image (Kubernetes)
This is intended to run using the original docker image

Patching can be done to the official kubernetes config found [here](https://github.com/n8n-io/n8n-kubernetes-hosting/blob/main/n8n-deployment.yaml) by replacing the `command` and `args`

Replace:
```yaml
- command:
    - /bin/sh
  args:
    - -c
    - sleep 5; n8n start
```

with:
```yaml
- command: ["/bin/sh", "-c"]
  args:
    - |
      sleep 5
      sed -i.bak 's/throw new Error("cert was not issued by an approved issuer")/{}/g' /usr/local/lib/node_modules/n8n/node_modules/@n8n_io/license-sdk/dist/LicenseManager.js
      exec su -s /bin/sh -c "exec n8n start" node
  securityContext:
    runAsUser: 0
```

## Patching N8N docker image (Standalone docker)
If you run n8n only using the `docker run` command you will need to write your own Docker file that will do the patching.

(the reader can figure out this)

