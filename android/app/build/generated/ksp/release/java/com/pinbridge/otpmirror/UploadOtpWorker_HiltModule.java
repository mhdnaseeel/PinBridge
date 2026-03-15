package com.pinbridge.otpmirror;

import androidx.hilt.work.WorkerAssistedFactory;
import androidx.work.ListenableWorker;
import dagger.Binds;
import dagger.Module;
import dagger.hilt.InstallIn;
import dagger.hilt.codegen.OriginatingElement;
import dagger.hilt.components.SingletonComponent;
import dagger.multibindings.IntoMap;
import dagger.multibindings.StringKey;
import javax.annotation.processing.Generated;

@Generated("androidx.hilt.AndroidXHiltProcessor")
@Module
@InstallIn(SingletonComponent.class)
@OriginatingElement(
    topLevelClass = UploadOtpWorker.class
)
public interface UploadOtpWorker_HiltModule {
  @Binds
  @IntoMap
  @StringKey("com.pinbridge.otpmirror.UploadOtpWorker")
  WorkerAssistedFactory<? extends ListenableWorker> bind(UploadOtpWorker_AssistedFactory factory);
}
