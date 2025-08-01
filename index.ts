import {nanoid} from "nanoid";

export enum resultStatus {
    success,
    callError,
    error,
    closeError,
    networkError,
    timeoutError
}

export interface result<T> {
    Id?: string
    Code?: number | undefined
    Msg?: string  | undefined
    Status: resultStatus
    Data?:  | undefined
}

enum status {
    susses,
    close
}

enum workerDataType {
    open,
    close,
    data
}

interface workerType {
    type: workerDataType
    data: any
}

interface requestInfo<T> {
    id: string
    methodName: string
    serviceName: string
    dto?: T | undefined
    state: Map<string, any>
    type: requestType
    func?: (data: result<any>) => void
    on?: on<any>
}

enum requestType {
    funcType,
    proxyType,
    closeType
}

export class on<T> {
    onMessage(data: T): void {

    }

    onClose(result?: result<T>): void {

    }
}

export default class client {
    private worker: globalThis.MessagePort | Worker | null = null;
    private status: status = status.close;
    private requestList: requestInfo<any>[] = [];
    private formerCall: ((serviceName: string ,methodName: string, state: Map<string, any>) => void) | null = null;
    private afterCall: (( serviceName: string ,methodName: string,result: result<any>) => result<any>) | null = null;
    private openCall: (() => void)[] = [];
    private closeCall: (() => void)[] = [];

    constructor(url: string) {
        this.worker = getWorker(url)
        const that = this;
        this.worker.onmessage = function (e) {
            const data: workerType = JSON.parse (e.data);
            that.getMessage(data)
        }
        if (this.worker instanceof MessagePort) {
            window.addEventListener ('beforeunload', () => {
                this.requestList.forEach ((request) => {
                    if (request.type === requestType.proxyType) {
                        request.func && request.func (this.networkError(request.serviceName, request.methodName))
                        const map = new Map<string, any> ();
                        this.formerCall && this.formerCall (request.serviceName, request.methodName, map);
                        request.type = requestType.closeType;
                        request.state = map;
                        this.worker?.postMessage (JSON.stringify (request));
                    }
                })
            });
        }
        this.worker instanceof MessagePort && this.worker.start ()
    }

    public getMessage(data: workerType) {
        const that = this;
        switch (data.type) {
            case workerDataType.open:
                that.status = status.susses
                that.requestList.forEach ((requestInfo) => {
                    that.worker?.postMessage (JSON.stringify (requestInfo));
                })
                that.openCall.forEach ((openCall) => {
                    openCall ()
                })
                break
            case workerDataType.close:
                that.status = status.close
                that.requestList.forEach ((request) => {
                    if (request.type === requestType.funcType) {
                        request.func && request.func (this.networkError(request.serviceName, request.methodName))
                    } else {
                        request.on?.onClose ()
                    }
                })
                that.requestList.length = 0
                that.closeCall.forEach ((closeCall) => {
                    closeCall ()
                })
                break;
            default:
                let result: result<any> = JSON.parse(data.data);
                this.getData(result)
        }
    }

    private getData(data: result<any>) {
        const index = this.requestList.findIndex ((request) => request.id === data.Id)
        const request: requestInfo<any> = this.requestList[index]
        if (request.type === requestType.funcType) {
            request.func && request.func (this.after(request.serviceName, request.methodName,data))
        } else {
            if (data.Status === resultStatus.success) {
                request.on?.onMessage (data.Data)
            } else if (data.Status === resultStatus.closeError) {
                request.on?.onClose ()
            }
        }
        (request.type === requestType.funcType || data.Status === resultStatus.closeError) && this.deleteRequest(request.id)
    }

    private networkError(serviceName: string ,methodName: string):result<any> {
        return this.after(serviceName, methodName,{Status: resultStatus.networkError})
    }

    private timeoutError(serviceName: string ,methodName: string):result<any> {
        return this.after(serviceName, methodName,{Status: resultStatus.timeoutError})
    }

    private after<T>(serviceName: string ,methodName: string, result: result<T>):result<T> {
        return this.afterCall ? this.afterCall (serviceName, methodName, result) : result
    }

    public async request<T>(serviceName: string, methodName: string, dto?: object | null): Promise<result<T>>;
    public async request<T>(serviceName: string, methodName: string, dto: object | null, on: on<T>): Promise<(() => void)>;
    public async request<T>(serviceName: string, methodName: string, dto: object | null = null, on?: on<T>): Promise<result<T> | (() => void)> {
        return new Promise<result<T> | (()=>void)>((resolve, reject) => {
            const id: string = nanoid ();
            const state = new Map<string, any> ();
            let requestInfo: requestInfo<any> = {
                id,
                methodName: methodName,
                serviceName: serviceName,
                type: on ? requestType.proxyType : requestType.funcType,
                state,
            };
            if (on) {
                requestInfo.on = on;
            } else {
                requestInfo.func = (data: result<T>) => {
                    resolve (this.after (serviceName, methodName, data));
                };
            }
            if (dto) {
                requestInfo.dto = dto;
            }
            this.formerCall && this.formerCall (serviceName, methodName, state);
            if (this.status !== status.close) {
                this.worker?.postMessage (JSON.stringify (requestInfo));
            }
            this.requestList.push (requestInfo);
            const handleTimeout = (isNetworkError: boolean, timeout: number) => {
                setTimeout(() => {
                    const expectedStatus = isNetworkError ? status.close : status.susses;
                    if (this.status === expectedStatus && this.isRequestId(id)) {
                        if (requestInfo.type === requestType.funcType) {
                            resolve(isNetworkError ? this.networkError(serviceName, methodName) : this.timeoutError(serviceName, methodName));
                        } else {
                            requestInfo.on?.onClose(isNetworkError ? this.networkError(serviceName, methodName) : this.timeoutError(serviceName, methodName));
                        }
                        this.deleteRequest(id);
                    }
                }, timeout);
            };
            handleTimeout(true, 2000);   // 网络错误
            handleTimeout(false, 10000); // 超时错误
            if (on) {
                resolve(() => {
                    const state = new Map<string, any> ();
                    let requestInfo: requestInfo<any> = {
                        id,
                        methodName: methodName,
                        serviceName: serviceName,
                        type: requestType.closeType,
                        state,
                    };
                    on.onClose();
                    this.formerCall && this.formerCall (serviceName, methodName, state);
                    if (this.status !== status.close) {
                        this.worker?.postMessage (JSON.stringify (requestInfo));
                        this.requestList.push (requestInfo);
                    }
                })
            }
        })
    }

    public deleteRequest(id: string) {
        this.requestList = this.requestList.filter ((requestInfo) => {
            return requestInfo.id !== id
        })
    }

    public isRequestId(id: string) {
        return this.requestList.some ((requestInfo) => {
            return requestInfo.id === id
        })
    }


    public async onFormer(func: (serviceName: string, methodName: string, state: Map<string, any>) => void) {
        this.formerCall = func
    }

    public onAfter(func: (serviceName: string ,methodName: string,result: result<any>) => result<any>) {
        this.afterCall = func
    }

    public onClose(func: () => void) {
        this.closeCall.push (func)
    }

    public onOpen(func: () => void) {
        this.openCall.push (func)
    }

}

const getWorker = (url: string):MessagePort | Worker => {
    const workerUrl = new URL( './worker', import.meta.url);
    workerUrl.searchParams.set('id', getId());
    workerUrl.searchParams.set('url', url);
    if (typeof SharedWorker !== 'undefined') {
        return  new SharedWorker(workerUrl).port;
    } else {
        return  new Worker(workerUrl);
    }
};


function getId() : string {
    if (!localStorage.getItem ("id")) {
        localStorage.setItem ("id", nanoid ())
    }
    return localStorage.getItem ("id") as string
}
