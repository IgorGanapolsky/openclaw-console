// Models/RecurringTask.swift
// OpenClaw Work Console
// Model for background loops/recurring tasks

import Foundation

struct RecurringTask: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String?
    let schedule: String
    let enabled: Bool
    let lastRun: Date?
    let nextRun: Date?
    let status: String

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case description
        case schedule
        case enabled
        case lastRun = "last_run"
        case nextRun = "next_run"
        case status
    }
}