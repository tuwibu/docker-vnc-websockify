"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dockerode_1 = __importDefault(require("dockerode"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const net_1 = __importDefault(require("net"));
const ws_1 = __importDefault(require("ws"));
const yargs_1 = __importDefault(require("yargs"));
const argv = yargs_1.default.options({
    port: {
        alias: "p",
        description: "Port to listen on",
        type: "number",
        default: 8080,
    },
}).argv;
const PORT = argv.port || 8080;
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const containers = new Map();
const getContainers = () => __awaiter(void 0, void 0, void 0, function* () {
    containers.clear();
    const docker = new dockerode_1.default();
    const list = yield docker.listContainers();
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
});
app.get("/container", (req, res) => {
    getContainers().then((data) => {
        res.json({
            status: 1,
            data
        });
    }).catch((err) => {
        res.json({
            status: 0,
            message: err.message
        });
    });
});
server.on("upgrade", (request, socket, head) => __awaiter(void 0, void 0, void 0, function* () {
    yield getContainers();
    const targets = [];
    for (let item of containers) {
        // localhost:8080/:containerId -> localhost:publicPort
        targets.push({
            host: "localhost",
            port: item[1].port.public,
            // host: item[1].privateIp,
            // port: item[1].port.private,
            connection: {},
            path: `/${item[0]}`,
        });
    }
    for (let target of targets) {
        target.ws = new ws_1.default.Server({
            noServer: true,
            path: target.path
        });
        target.ws.on("connection", (ws, req) => {
            const cid = Date.now();
            const remoteAddress = req.socket.remoteAddress;
            const connection = net_1.default.createConnection(target.port, target.host);
            connection.on("connect", () => {
                console.log(`${remoteAddress} -> Connected to target on ${target.host}:${target.port}`);
                target.connection[cid] = connection;
            });
            connection.on("data", (data) => {
                try {
                    ws.send(data);
                }
                catch (err) {
                    console.log(`${remoteAddress} -> Client closed, cleaning up target`);
                    connection.end();
                }
            });
            connection.on("end", () => {
                console.log(`${remoteAddress} -> Target disconnected`);
                ws.close();
                delete target.connection[cid];
            });
            connection.on("error", (err) => {
                console.log(`${remoteAddress} -> Connection error: ${err.message}`);
                connection.destroy();
                ws.close();
                delete target.connection[cid];
            });
            ws.on("message", (data) => {
                connection.write(data);
            });
            ws.on("close", () => {
                console.log(`${remoteAddress} -> Client disconnected`);
                connection.end();
            });
        });
        if (request.url == target.path) {
            console.log("CONNECT");
            target.ws.handleUpgrade(request, socket, head, (ws) => {
                target.ws.emit('connection', ws, request);
            });
        }
        ;
    }
}));
server.listen(PORT, () => {
    console.log('Listening on *:' + PORT);
});
