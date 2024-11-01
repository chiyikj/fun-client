interface request {
  id: string
  methodName: string
  dto: Object | null
  state: Map<string, any>
  methodType?: methodType
  func?: (data: result<any>) => void
  on?: on<any>

}

enum resultStatus {
  success,
  callError,
  error,
  closeError,
  networkError
}

interface result<T> {
  Id?: string | null
  Code?: number | null
  Msg?: string
  Status?: resultStatus
  Data?: T
}

enum methodType {
  function,
  proxy
}


interface on<T> {
  onMessage: (data: T) => void
  onClose: () => void
  onError: (result: result<T>) => void
}

enum status {
  susses,
  close,
  no //没有初始化连接
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


export default class fun {
  static client:client|null = null
  static create(url: string):client{
    this.client = this.client ? this.client : new client(url);
    return this.client;
  }
}
class client {
  private worker: SharedWorker | null = null;
  private status: status = status.no;
  private requestList: request[] = [];
  private formerCall: ((methodName: string, state: Map<string, any>) => void) | null = null;
  private afterCall: ((result: result<any>, methodName: string) => result<any>) | null = null;
  private openCall: (() => void)[] = [];
  private closeCall: (() => void)[] = [];
  constructor(url: string) {
    this.worker = new SharedWorker (new URL ('./worker', import.meta.url) + "?url=" + url + "&id=" + getId ());
    const that = this;
    this.worker.port.onmessage = function (e) {
      let data:workerType = JSON.parse (e.data);
      switch (data.type) {
        case  workerDataType.open:
          that.status = status.susses
          that.openCall.forEach ((openCall) => {
            openCall ()
          })
          break
        case workerDataType.close:
          that.status = status.close
          that.requestList.forEach((request)=>{
            if (request.methodType === methodType.function) {
              request.func && request.func({Status: resultStatus.closeError})
            } else {
              request.on?.onClose()
            }
          })
          that.requestList.length = 0
          that.closeCall.forEach ((closeCall) => {
            closeCall ()
          })
          break
        case workerDataType.data:
          let result:result<any> = JSON.parse(data.data);
          const index = that.requestList.findIndex((request) => request.id === result.Id)
          if (index == -1) break
          const request:request = that.requestList[index]
          if (request.methodType === methodType.function) {
            request.func && request.func(result)
          } else {
            if (result.Status === resultStatus.success) {
              request.on?.onMessage(result.Data)
            } else if (result.Status === resultStatus.closeError) {
              request.on?.onClose()
            }
          }
          if (request.methodType === methodType.function || result.Status === resultStatus.closeError) {
            that.requestList.splice(index, 1);
          }
          break
        default:
          break
      }
    }
    window.addEventListener ('beforeunload', () => {
      const requestIdList = this.requestList.filter ((request) => request.methodType === methodType.proxy).join ()
      const map = new Map<string, any> ();
      this.formerCall && this.formerCall ("close", map);
      this.worker?.port.postMessage (JSON.stringify ({
        id:requestIdList,
        method: "close",
        state: map
      }));
    });
    this.worker.port.start ()

  }

  public async request<T>(methodName: string, dto: Object | null, on?: on<T>) {
    const after = (result: result<T>): result<T> => {
      return this.afterCall ? this.afterCall (result, methodName) : result
    }
    await new Promise ((resolve) => {
      let status1 = false
      const timeoutFunc = setTimeout (() => {
        status1 = true
      }, 2000)
      const interval = setInterval(() => {
        if (this.status !== status.no || status1) {
          clearTimeout(timeoutFunc)
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    })
    const id: string = crypto.randomUUID ();
    const state = new Map<string, any> ();
    this.formerCall && this.formerCall (methodName, state);
    const request: request = {
      id,
      methodName,
      state,
      dto,
    }
    if (on) {
      if (this.status !== status.susses) {
        on.onError (after ({
          Status: resultStatus.networkError
        }))
        on.onClose()
      }
      request.methodType = methodType.proxy
      this.worker?.port.postMessage (JSON.stringify (request));
      request.on = on
      this.requestList.push (request);
    }
    return new Promise<(() => void) | result<T>> ((resolve) => {
      if (on) {
        resolve (() => {
          const map = new Map<string, any> ();
          this.formerCall && this.formerCall (methodName, map);
          this.worker?.port.postMessage (JSON.stringify ({
            id,
            method: "close",
            state: map
          }));
        })
      } else {
        const func = (data: result<T>) => {
          delete data.Id
          switch (data.Status) {
            case resultStatus.success:
              delete data.Code
              break
            case resultStatus.callError:
              data.Msg = data.Data as string
              delete data.Data
              delete data.Code
              break
            case resultStatus.error:
              data.Msg = data.Data as string
              delete data.Data
              break
          }
          resolve (after (data));
        }
        if (this.status !== status.susses) {
          func ({
            Status: resultStatus.networkError
          })
        }
        request.methodType = methodType.function
        this.worker?.port.postMessage (JSON.stringify (request));
        request.func = func
        this.requestList.push (request);
      }
    })
  }

  public onFormer(func: (methodName: string, state: Map<string, any>) => void) {
    this.formerCall = func
  }

  public onAfter(func: (result: result<any>, methodName: string) => result<any>) {
    this.afterCall = func
  }

  public onClose(func: () => void) {
    this.closeCall.push (func)
  }

  public onOpen(func: () => void) {
    this.openCall.push (func)
  }

}

function getId() {
  if (!localStorage.getItem ("id")) {
    localStorage.setItem ("id", crypto.randomUUID ())
  }
  return localStorage.getItem ("id")
}
