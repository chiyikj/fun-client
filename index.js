var resultStatus;
(function (resultStatus) {
    resultStatus[resultStatus["success"] = 0] = "success";
    resultStatus[resultStatus["error"] = 1] = "error";
    resultStatus[resultStatus["callError"] = 2] = "callError";
    resultStatus[resultStatus["closeError"] = 3] = "closeError";
    resultStatus[resultStatus["networkError"] = 4] = "networkError";
    resultStatus[resultStatus["timeoutError"] = 5] = "timeoutError";
})(resultStatus || (resultStatus = {}));
var methodType;
(function (methodType) {
    methodType[methodType["function"] = 0] = "function";
    methodType[methodType["proxy"] = 1] = "proxy";
})(methodType || (methodType = {}));
var status;
(function (status) {
    status[status["susses"] = 0] = "susses";
    status[status["close"] = 1] = "close";
    status[status["no"] = 2] = "no"; //没有初始化连接
})(status || (status = {}));
var workerDataType;
(function (workerDataType) {
    workerDataType[workerDataType["open"] = 0] = "open";
    workerDataType[workerDataType["close"] = 1] = "close";
    workerDataType[workerDataType["data"] = 2] = "data";
})(workerDataType || (workerDataType = {}));
class fun {
    static create(url) {
        this.client = this.client ? this.client : new client(url);
        return this.client;
    }
}
fun.client = null;
export default fun;
class client {
    constructor(url) {
        this.worker = null;
        this.status = status.no;
        this.requestList = [];
        this.formerCall = null;
        this.afterCall = null;
        this.openCall = [];
        this.closeCall = [];
        this.worker = new SharedWorker(new URL('./worker', import.meta.url) + "?url=" + url + "&id=" + getId());
        const that = this;
        this.worker.port.onmessage = function (e) {
            let data = JSON.parse(e.data);
            switch (data.type) {
                case workerDataType.open:
                    that.status = status.susses;
                    that.openCall.forEach((openCall) => {
                        openCall();
                    });
                    break;
                case workerDataType.close:
                    that.status = status.close;
                    that.requestList.length = 0;
                    that.closeCall.forEach((closeCall) => {
                        closeCall();
                    });
                    break;
                case workerDataType.data:
                    let result = data.data;
                    const index = that.requestList.findIndex((request) => request.id === result.Id);
                    const request = that.requestList[index];
                    if (request.methodType === methodType.function) {
                        request.func && request.func(result);
                    }
                    else {
                        if (result.Status === resultStatus.success) {
                            request.on?.onMessage(result.Data);
                        }
                        else if (result.Status === resultStatus.closeError) {
                            request.on?.onClose();
                        }
                    }
                    if (request.methodType === methodType.function || result.Status === resultStatus.closeError) {
                        that.requestList.splice(index, 1);
                    }
                    break;
                default:
                    break;
            }
        };
        window.addEventListener('beforeunload', () => {
            const requestIdList = this.requestList.filter((request) => request.methodType === methodType.proxy).join();
            const map = new Map();
            this.formerCall && this.formerCall("close", map);
            this.worker?.port.postMessage(JSON.stringify({
                id: requestIdList,
                method: "close",
                state: map
            }));
        });
        this.worker.port.start();
    }
    async request(methodName, dto, on) {
        await new Promise((resolve) => {
            while (this.status !== status.no) {
                resolve(null);
            }
        });
        const id = crypto.randomUUID();
        const state = new Map();
        this.formerCall && this.formerCall(methodName, state);
        const after = (result) => {
            return this.afterCall ? this.afterCall(result, methodName) : result;
        };
        const request = {
            id,
            methodName,
            state,
            dto,
        };
        if (on) {
            if (this.status == status.close) {
                on.onError(after({
                    Status: resultStatus.networkError
                }));
                on.onClose();
            }
            request.methodType = methodType.proxy;
            this.worker?.port.postMessage(JSON.stringify(request));
            request.on = on;
            this.requestList.push(request);
        }
        return new Promise((resolve) => {
            if (on) {
                resolve(() => {
                    const map = new Map();
                    this.formerCall && this.formerCall(methodName, map);
                    this.worker?.port.postMessage(JSON.stringify({
                        id,
                        method: "close",
                        state: map
                    }));
                });
            }
            else {
                const func = (data) => {
                    resolve(after(data));
                };
                if (this.status == status.close) {
                    func({
                        Status: resultStatus.networkError
                    });
                }
                request.methodType = methodType.function;
                this.worker?.port.postMessage(JSON.stringify(request));
                const timeoutFunc = setTimeout(() => {
                    func({
                        Status: resultStatus.timeoutError
                    });
                }, 10000);
                request.timeoutFunc = () => {
                    clearTimeout(timeoutFunc);
                };
                request.func = func;
                this.requestList.push(request);
            }
        });
    }
    onFormer(func) {
        this.formerCall = func;
    }
    onAfter(func) {
        this.afterCall = func;
    }
    onClose(func) {
        this.closeCall.push(func);
    }
    onOpen(func) {
        this.openCall.push(func);
    }
}
function getId() {
    if (!localStorage.getItem("id")) {
        localStorage.setItem("id", crypto.randomUUID());
    }
    return localStorage.getItem("id");
}
