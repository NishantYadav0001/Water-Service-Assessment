package com.jalseva.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Represents a single supply-disruption record
 * within an assessment submission.
 */
public class DisruptionDTO {

    @NotBlank(message = "Disruption reason is required.")
    private String reason;

    @PositiveOrZero(message = "Number of times must be zero or positive.")
    private int numberOfTimes;

    @PositiveOrZero(message = "Resolution days must be zero or positive.")
    private int resolutionDays;

    // --- Constructors ---

    public DisruptionDTO() {}

    public DisruptionDTO(String reason, int numberOfTimes, int resolutionDays) {
        this.reason = reason;
        this.numberOfTimes = numberOfTimes;
        this.resolutionDays = resolutionDays;
    }

    // --- Getters & Setters ---

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public int getNumberOfTimes() {
        return numberOfTimes;
    }

    public void setNumberOfTimes(int numberOfTimes) {
        this.numberOfTimes = numberOfTimes;
    }

    public int getResolutionDays() {
        return resolutionDays;
    }

    public void setResolutionDays(int resolutionDays) {
        this.resolutionDays = resolutionDays;
    }

    @Override
    public String toString() {
        return "DisruptionDTO{" +
                "reason='" + reason + '\'' +
                ", numberOfTimes=" + numberOfTimes +
                ", resolutionDays=" + resolutionDays +
                '}';
    }
}
