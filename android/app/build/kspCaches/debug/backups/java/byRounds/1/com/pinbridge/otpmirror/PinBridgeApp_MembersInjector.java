package com.pinbridge.otpmirror;

import androidx.hilt.work.HiltWorkerFactory;
import dagger.MembersInjector;
import dagger.internal.DaggerGenerated;
import dagger.internal.InjectedFieldSignature;
import dagger.internal.QualifierMetadata;
import javax.annotation.processing.Generated;
import javax.inject.Provider;

@QualifierMetadata
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
public final class PinBridgeApp_MembersInjector implements MembersInjector<PinBridgeApp> {
  private final Provider<HiltWorkerFactory> workerFactoryProvider;

  public PinBridgeApp_MembersInjector(Provider<HiltWorkerFactory> workerFactoryProvider) {
    this.workerFactoryProvider = workerFactoryProvider;
  }

  public static MembersInjector<PinBridgeApp> create(
      Provider<HiltWorkerFactory> workerFactoryProvider) {
    return new PinBridgeApp_MembersInjector(workerFactoryProvider);
  }

  @Override
  public void injectMembers(PinBridgeApp instance) {
    injectWorkerFactory(instance, workerFactoryProvider.get());
  }

  @InjectedFieldSignature("com.pinbridge.otpmirror.PinBridgeApp.workerFactory")
  public static void injectWorkerFactory(PinBridgeApp instance, HiltWorkerFactory workerFactory) {
    instance.workerFactory = workerFactory;
  }
}
