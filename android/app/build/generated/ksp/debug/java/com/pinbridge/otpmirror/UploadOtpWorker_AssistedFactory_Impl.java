package com.pinbridge.otpmirror;

import android.content.Context;
import androidx.work.WorkerParameters;
import dagger.internal.DaggerGenerated;
import dagger.internal.InstanceFactory;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@DaggerGenerated
@Generated(
    value = "dagger.internal.codegen.ComponentProcessor",
    comments = "https://dagger.dev"
)
@SuppressWarnings({
    "unchecked",
    "rawtypes",
    "KotlinInternal",
    "KotlinInternalInJava",
    "cast",
    "deprecation"
})
public final class UploadOtpWorker_AssistedFactory_Impl implements UploadOtpWorker_AssistedFactory {
  private final UploadOtpWorker_Factory delegateFactory;

  UploadOtpWorker_AssistedFactory_Impl(UploadOtpWorker_Factory delegateFactory) {
    this.delegateFactory = delegateFactory;
  }

  @Override
  public UploadOtpWorker create(Context p0, WorkerParameters p1) {
    return delegateFactory.get(p0, p1);
  }

  public static Provider<UploadOtpWorker_AssistedFactory> create(
      UploadOtpWorker_Factory delegateFactory) {
    return InstanceFactory.create(new UploadOtpWorker_AssistedFactory_Impl(delegateFactory));
  }

  public static dagger.internal.Provider<UploadOtpWorker_AssistedFactory> createFactoryProvider(
      UploadOtpWorker_Factory delegateFactory) {
    return InstanceFactory.create(new UploadOtpWorker_AssistedFactory_Impl(delegateFactory));
  }
}
