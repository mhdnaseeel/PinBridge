package com.pinbridge.otpmirror

import android.content.Context
import androidx.work.*
import com.pinbridge.otpmirror.data.PairingRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import androidx.hilt.work.HiltWorker
import java.time.Duration

@HiltWorker
class HeartbeatWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted workerParams: WorkerParameters,
    private val pairingRepository: PairingRepository
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        if (!pairingRepository.isPaired()) return Result.success()
        
        pairingRepository.heartbeat()
        return Result.success()
    }

    companion object {
        fun enqueue(context: Context) {
            val request = PeriodicWorkRequestBuilder<HeartbeatWorker>(
                Duration.ofMinutes(15) // Shortest allowed interval for periodic work
            ).build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "heartbeat",
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
        
        fun stop(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork("heartbeat")
        }
    }
}
