declare enum resultStatus {
    success = 0,
    callError = 1,
    error = 2,
    closeError = 3,
    networkError = 4
}
interface result<T> {
    Id?: string | null;
    Code?: number | null;
    Msg?: string;
    Status?: resultStatus;
    Data?: T;
}
interface on<T> {
    onMessage: (data: T) => void;
    onClose: () => void;
    onError: (result: result<T>) => void;
}
export default class fun {
    static client: client | null;
    static create(url: string): client;
}
declare class client {
    private worker;
    private status;
    private requestList;
    private formerCall;
    private afterCall;
    private openCall;
    private closeCall;
    constructor(url: string);
    request<T>(methodName: string, argumentsList: any[] | null, on?: on<T>): Promise<result<T> | (() => void)>;
    onFormer(func: (methodName: string, state: Map<string, any>) => void): void;
    onAfter(func: (result: result<any>, methodName: string) => result<any>): void;
    onClose(func: () => void): void;
    onOpen(func: () => void): void;
}
export {};
