import Foundation
import Observation

@Observable
class BridgeListViewModel {
    private let webSocket: WebSocketService

    init(webSocket: WebSocketService) {
        self.webSocket = webSocket
    }
}