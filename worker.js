const searchParams = new URLSearchParams(location.search)
const url = searchParams.get('url')
const id = searchParams.get('id')
let ws = null
let clientList = []
let requestList = []
let time1 = null;
self.onconnect = (e) => {
    const port = e.ports[0];
    if (clientList.length === 0) {
        newWs(port)
    } else {
        if (time1) {
            port.postMessage(JSON.stringify({
                type: 0
            }))
        }
    }
    clientList.push(port)
    //监听消息
    port.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.method === "close") {
            const requestIdList = data.id.split(",")
            requestIdList.forEach((requestId)=>{
                const index = requestList.findIndex((request) => request.request.id === requestId)
                requestList.splice(index, 1);
            })
        } else {
            requestList.push({
                request: data,
                port,
            })
        }
        ws.send(JSON.stringify(data))
    };
    port.start();
};

function ping(ws) {
    ws.send(JSON.stringify({
        methodName: "ping",
    }))
}

function newWs(port) {
    ws = new WebSocket(url + "?id=" + id);
    let time = null;
    ws.onopen = function () {
        clientList.forEach((port) => {
            port.postMessage(JSON.stringify({
                type: 0
            }))
        })
        const Ping = ()=>{
            ping(ws)
            time = setTimeout(() => {
                ws.close()
            }, 2000)
        }
        Ping()
        time1 = setInterval(() => {
            Ping()
        }, 5000);
    };

    ws.onmessage = function (evt) {
        const data = JSON.parse (evt.data);
        if (data.Data === "pong") {
            clearTimeout(time)
        } else {
            const index = requestList.findIndex((request) => request.request.id === data.Id)
            const request = requestList[index]
            if (request.request.methodType === 0 || data.Status === 3) {
                requestList.splice(index, 1);
            }
            request.port.postMessage(JSON.stringify({type: 2, data: JSON.stringify(data)}))
        }
    };

    ws.onclose = function () {
        if (time1) {
            clientList.forEach((port) => {
                port.port.postMessage(JSON.stringify({
                    type: 1
                }))
            })
            requestList.length = 0
            clearInterval(time1)
            newWs()
        } else {
            setTimeout(() => {
                newWs()
            }, 5000)
        }
    };
}
