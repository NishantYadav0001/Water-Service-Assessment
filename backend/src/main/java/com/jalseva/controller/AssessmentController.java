package com.jalseva.controller;

import com.jalseva.dto.AssessmentDTO;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * REST controller for Drinking Water Service Assessment assessment submissions.
 */
@RestController
@RequestMapping("/api/assessments")
@CrossOrigin(origins = "*")   // Allow frontend dev server during prototyping
public class AssessmentController {

    private static final Logger log = LoggerFactory.getLogger(AssessmentController.class);

    /**
     * POST /api/assessments/submit
     *
     * Accepts the assessment form payload, validates basic structure,
     * and returns a confirmation response.
     *
     * In a production application this would persist the data to a
     * database and trigger any downstream workflows.
     */
    @PostMapping("/submit")
    public ResponseEntity<Map<String, Object>> submitAssessment(
            @Valid @RequestBody AssessmentDTO assessment) {

        log.info("Received assessment submission: {}", assessment);

        // --- Build success response ---
        String referenceId = "JSA-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("status", "SUCCESS");
        response.put("message", "Assessment submitted successfully.");
        response.put("referenceId", referenceId);
        response.put("receivedAt", LocalDateTime.now().toString());
        response.put("disruptionsCount",
                assessment.getDisruptions() != null ? assessment.getDisruptions().size() : 0);

        log.info("Assessment recorded — ref: {}", referenceId);

        return ResponseEntity.ok(response);
    }

    // --- Helper ---
    private ResponseEntity<Map<String, Object>> badRequest(String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("status", "ERROR");
        error.put("message", message);
        return ResponseEntity.badRequest().body(error);
    }
}
