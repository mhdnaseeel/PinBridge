package com.pinbridge.otpmirror

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConstantsTest {

    @Test
    fun `pref names are non empty`() {
        assertThat(Constants.PREFS_NAME).isNotEmpty()
        assertThat(Constants.KEY_DEVICE_ID).isNotEmpty()
        assertThat(Constants.KEY_SECRET).isNotEmpty()
    }
}
