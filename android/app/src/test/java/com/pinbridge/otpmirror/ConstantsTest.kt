package com.pinbridge.otpmirror

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConstantsTest {

    @Test
    fun testConstantsAreNotEmpty() {
        assertThat(Constants.PREFS_NAME).isNotEmpty()
        assertThat(Constants.KEY_DEVICE_ID).isNotEmpty()
        assertThat(Constants.KEY_SECRET).isNotEmpty()
        assertThat(Constants.KEY_IS_PAIRED).isNotEmpty()
        assertThat(Constants.COLL_PAIRINGS).isNotEmpty()
        assertThat(Constants.COLL_OTPS).isNotEmpty()
    }
}
