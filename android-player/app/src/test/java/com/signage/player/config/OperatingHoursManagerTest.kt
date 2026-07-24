package com.signage.player.config

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OperatingHoursManagerTest {
    @Test
    fun sameDayWindowUsesExclusiveEnd() {
        assertTrue(isWithinScheduleWindow(8 * 3600, 8 * 3600, 22 * 3600))
        assertFalse(isWithinScheduleWindow(22 * 3600, 8 * 3600, 22 * 3600))
    }

    @Test
    fun overnightWindowSpansMidnight() {
        assertTrue(isWithinScheduleWindow(23 * 3600, 22 * 3600, 6 * 3600))
        assertTrue(isWithinScheduleWindow(2 * 3600, 22 * 3600, 6 * 3600))
        assertFalse(isWithinScheduleWindow(12 * 3600, 22 * 3600, 6 * 3600))
    }

    @Test
    fun equalStartAndEndMeansAlwaysOn() {
        assertTrue(isWithinScheduleWindow(12 * 3600, 0, 0))
    }
}