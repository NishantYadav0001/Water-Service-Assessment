package com.jalseva.dto;

import java.util.List;

/**
 * Data Transfer Object for the Jal Seva Aankalan
 * assessment submission payload.
 */
public class AssessmentDTO {

    private String discussionDate;       // ISO date string (yyyy-MM-dd)
    private String reportingYear;        // e.g. "2025-26"
    private boolean vwscApproval;
    private boolean gramSabhaApproval;
    private int totalHouseholds;
    private String supplySchedule;       // e.g. "24x7", "DAILY_ONCE", etc.
    private List<DisruptionDTO> disruptions;

    // --- Constructors ---

    public AssessmentDTO() {}

    // --- Getters & Setters ---

    public String getDiscussionDate() {
        return discussionDate;
    }

    public void setDiscussionDate(String discussionDate) {
        this.discussionDate = discussionDate;
    }

    public String getReportingYear() {
        return reportingYear;
    }

    public void setReportingYear(String reportingYear) {
        this.reportingYear = reportingYear;
    }

    public boolean isVwscApproval() {
        return vwscApproval;
    }

    public void setVwscApproval(boolean vwscApproval) {
        this.vwscApproval = vwscApproval;
    }

    public boolean isGramSabhaApproval() {
        return gramSabhaApproval;
    }

    public void setGramSabhaApproval(boolean gramSabhaApproval) {
        this.gramSabhaApproval = gramSabhaApproval;
    }

    public int getTotalHouseholds() {
        return totalHouseholds;
    }

    public void setTotalHouseholds(int totalHouseholds) {
        this.totalHouseholds = totalHouseholds;
    }

    public String getSupplySchedule() {
        return supplySchedule;
    }

    public void setSupplySchedule(String supplySchedule) {
        this.supplySchedule = supplySchedule;
    }

    public List<DisruptionDTO> getDisruptions() {
        return disruptions;
    }

    public void setDisruptions(List<DisruptionDTO> disruptions) {
        this.disruptions = disruptions;
    }

    @Override
    public String toString() {
        return "AssessmentDTO{" +
                "discussionDate='" + discussionDate + '\'' +
                ", reportingYear='" + reportingYear + '\'' +
                ", vwscApproval=" + vwscApproval +
                ", gramSabhaApproval=" + gramSabhaApproval +
                ", totalHouseholds=" + totalHouseholds +
                ", supplySchedule='" + supplySchedule + '\'' +
                ", disruptions=" + disruptions +
                '}';
    }
}
