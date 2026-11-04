---
checked: 0.1.2
---

## What it's for

k8s is a small Kubernetes client: it creates, gets, lists, watches and deletes Pods, Services and Jobs in a namespace, and reads a pod's log. It's what [Orca](/s/orca) uses to start a Dista cluster for each run. It knows no schema: you write manifests as JSON text and read the objects that come back as [json_mlake](/s/json_mlake) values, by JSON pointer.

## Install

A new project needs Modular's channel, pixi's build preview and the compiler before the tin:

```sh
pixi init app -c https://conda.modular.com/max -c conda-forge && cd app
sed -i.bak 's/^\[workspace\]/[workspace]\npreview = ["pixi-build"]/' pixi.toml
pixi add "mojo-compiler==1.2.0"
pixi shelf add k8s-mojo        # brings threads-mojo, json_mlake, flare_mlake
```

## Quick start

Start a pod, wait for it to finish, print its log and clean up:

```mojo
from k8s import Client, Config, PODS


def main() raises:
    var k = Client(Config.load())   # in a pod, its service account; else ~/.kube/config
    _ = k.create(
        PODS,
        '{"apiVersion": "v1", "kind": "Pod",'
        ' "metadata": {"name": "hello", "labels": {"app": "hello"}},'
        ' "spec": {"restartPolicy": "Never", "containers": [{"name": "c",'
        ' "image": "busybox", "command": ["echo", "hi"]}]}}',
    )
    var w = k.watch(PODS, "app=hello")
    while True:
        var e = w.next()            # None once the server ends the watch
        if not e:
            break
        var phase = e.value().object.try_at("/status/phase")
        if phase and phase.value().string_value() == "Succeeded":
            break
    print(k.logs("hello"))
    _ = k.delete_all(PODS, "app=hello")
```

## API

Everything is exported from `k8s`.

**`Config`**: where the API server is and how to authenticate to it. Its fields are `server`, `ca_file`, `cert_file`, `key_file`, `token`, `token_file` and `namespace`.

- `Config.load() raises -> Config`: in a pod, its service account's; otherwise the kubeconfig's current context.
- `Config.in_cluster() raises -> Config`: from the token, CA and namespace Kubernetes mounts in a pod. The token is read again for every request, since the kubelet rotates it.
- `Config.from_kubeconfig(path: String = "", context: String = "") raises -> Config`: the kubeconfig at `path`, else the first of `$KUBECONFIG`, else `~/.kube/config`, in `context` or its current one.
- `Config(server: String, ca_file: String = "", cert_file: String = "", key_file: String = "", token: String = "", token_file: String = "", namespace: String = "default")`: one you build yourself.

**`Client(var config: Config)`**: calls to the API server, as the config's user. An empty `namespace` means the config's.

- `create(self, r: Resource, manifest: String, namespace: String = "") raises -> Value`: creates the object and returns it as the server made it.
- `get(self, r: Resource, name: String, namespace: String = "") raises -> Optional[Value]`: the object, or None.
- `list(self, r: Resource, selector: String = "", namespace: String = "") raises -> Listed`: the objects matching a label selector (`app=x,run=7`), or all of them.
- `watch(self, r: Resource, selector: String = "", resource_version: String = "", timeout_seconds: Int = 300, namespace: String = "") raises -> Watch`: the changes to matching objects, until the server ends the watch.
- `delete(self, r: Resource, name: String, namespace: String = "", propagation: String = "Background") raises -> Bool`: deletes the object and what it owns (`Background`, `Foreground` or `Orphan`); False if there was none.
- `delete_all(self, r: Resource, selector: String, namespace: String = "") raises -> Int`: deletes every match and returns how many; the selector mustn't be empty.
- `logs(self, pod: String, container: String = "", namespace: String = "") raises -> String`: a pod's log, of its only container or of `container`; empty for a pod that's gone.

**`Resource`**: a kind of object, by where the API serves it. `PODS`, `SERVICES` and `JOBS` are the three defined; `Resource(prefix, plural)` names another namespaced kind.

**`Listed`**: `items: List[Value]` and the list's `resource_version`, to watch from.

**`Watch`**: `next(mut self) raises -> Optional[Event]` waits for the next event; `resource_version` is the last event's. **`Event`** has `type` (`ADDED`, `MODIFIED`, `DELETED` or `ERROR`) and `object`.

Also exported: `query_escape(s: String) -> String`, and the YAML reader the kubeconfig goes through (`read_yaml`, `Yaml`, `kubeconfig`).

## Errors and limits

- An answer that isn't 2xx raises `k8s: <METHOD> <path>: <code> <reason>: <message>`, with the API's own message. A 404 isn't an error for `get`, `delete` and `logs`.
- A watch with no `resource_version` starts with an `ADDED` event for each object that exists. To see every change, list first and watch from the list's `resource_version`; when a watch ends, watch again from the last event's. A 410 (the version is too old) raises: list again.
- Kubeconfig users with a client certificate and key, a token or a token file work. `exec` and `auth-provider` users (cloud CLIs) don't: run the command and pass its token. Inline certificates and keys are written to a fresh directory only you can read, since TLS takes them by path.
- The YAML reader takes the block style `kubectl` and `kind` write and raises on anything else.

## Tests

`pixi run unit` checks the YAML subset, kubeconfigs and query escaping without a server. `pixi run kind` runs every call against a [kind](https://kind.sigs.k8s.io) cluster; it needs docker, kind and kubectl. [Orca's K8S.md](https://github.com/magmalake/orca.mojo/blob/main/K8S.md) says why the client is small and what it covers.
