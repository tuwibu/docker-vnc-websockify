import Docker from "dockerode";
import express from "express";
import http from "http";
import net from "net";
import ws from "ws";
import yargs from "yargs";
import { demuxOutput } from "./demuxStream";
import cors from "cors";

const argv: any = yargs.options({
  port: {
    alias: "p",
    description: "Port to listen on",
    type: "number",
    default: 8080,
  },
}).argv;

const PORT = argv.port || 8080;

const app = express();
app.use(cors());
const server = http.createServer(app);
const containers = new Map<string, {
  name: string,
  privateIp: string,
  port: {
    public: number,
    private: number
  }
}>();

const getContainers = async () => {
  containers.clear();
  const docker = new Docker();
  const list = await docker.listContainers();
  const data = [];
  for (let item of list) {
    const bridge = Object.keys(item.NetworkSettings.Networks)[0];
    data.push({
      id: item.Id.slice(0, 12),
      name: item.Names[0].replace('/', ''),
      state: item.State,
      status: item.Status,
      port: {
        public: item.Ports[0].PublicPort,
        private: item.Ports[0].PrivatePort
      },
      privateIp: item.NetworkSettings.Networks[bridge].IPAddress,
    });
    containers.set(item.Id.slice(0, 12), {
      name: item.Names[0].replace('/', ''),
      privateIp: item.NetworkSettings.Networks[bridge].IPAddress,
      port: {
        public: item.Ports[0].PublicPort,
        private: item.Ports[0].PrivatePort  
      }
    });
  }
  return data;
}

app.get("/containers", (req, res) => {
  getContainers().then((data) => {
    res.json({
      status: 1,
      data
    });
  }).catch((err) => {
    res.json({
      status: 0,
      message: err.message
    })
  });
});

app.get("/logs/:containerId", (req, res) => {
  const docker = new Docker();
  const container = docker.getContainer(req.params.containerId);
  container.logs({
    follow: false,
    stdout: true,
    stderr: false,
    tail: 100
  }, (err, stream: any) => {
    if (err) {
      res.json({
        success: false,
        message: err.message
      });
      return;
    }
    res.json({
      success: true,
      data: demuxOutput(stream).toString("utf-8")
    });
  });
});

app.get("/view/:containerId", (req, res) => {
  const docker = new Docker();
  const container = docker.getContainer(req.params.containerId);
  container.logs({
    follow: false,
    stdout: true,
    stderr: false,
    tail: 100
  }, (err, stream: any) => {
    if (err) {
      res.json({
        success: false,
        message: err.message
      });
      return;
    }
    res.end(demuxOutput(stream).toString("utf-8"));
  });
});

server.on("upgrade", async(request, socket, head) => {
  await getContainers();
  const targets: {
    host: string,
    port: number,
    connection: Record<string, net.Socket>,
    path: string,
    ws?: ws.Server
  }[] = [];
  for (let item of containers) {
    // localhost:8080/:containerId -> localhost:publicPort
    targets.push({
      host: "localhost",
      port: item[1].port.public,
      connection: {},
      path: `/${item[0]}`,
    });
  }
  for(let target  of targets) {
    target.ws = new ws.Server({
      noServer: true,
      path: target.path
    });
    target.ws.on("connection", (ws, req) => {
      const cid = Date.now();
      const remoteAddress = req.socket.remoteAddress;
      const connection = net.createConnection(target.port, target.host);
      connection.on("connect", () => {
        target.connection[cid] = connection;
      });
      connection.on("data", (data) => {
        try {
          ws.send(data);
        } catch (err) {
          connection.end();
        }
      });
      connection.on("end", () => {
        ws.close();
        delete target.connection[cid];
      });
      connection.on("error", (err) => {
        connection.destroy();
        ws.close();
        delete target.connection[cid];
      });
      ws.on("message", (data: any) => {
        connection.write(data);
      });
      ws.on("close", () => {
        connection.end();
      });
    });
    if(request.url == target.path){
      target.ws.handleUpgrade(request, socket, head, (ws) => {
        target.ws.emit('connection', ws, request);
      });
    };
  }
});

server.listen(PORT, () => {
  console.log('Listening on *:' + PORT)
});