package com.pinbridge.otpmirror;

import com.pinbridge.otpmirror.data.PairingRepository;
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
public final class ManualCodeEntryActivity_MembersInjector implements MembersInjector<ManualCodeEntryActivity> {
  private final Provider<PairingRepository> pairingRepositoryProvider;

  public ManualCodeEntryActivity_MembersInjector(
      Provider<PairingRepository> pairingRepositoryProvider) {
    this.pairingRepositoryProvider = pairingRepositoryProvider;
  }

  public static MembersInjector<ManualCodeEntryActivity> create(
      Provider<PairingRepository> pairingRepositoryProvider) {
    return new ManualCodeEntryActivity_MembersInjector(pairingRepositoryProvider);
  }

  @Override
  public void injectMembers(ManualCodeEntryActivity instance) {
    injectPairingRepository(instance, pairingRepositoryProvider.get());
  }

  @InjectedFieldSignature("com.pinbridge.otpmirror.ManualCodeEntryActivity.pairingRepository")
  public static void injectPairingRepository(ManualCodeEntryActivity instance,
      PairingRepository pairingRepository) {
    instance.pairingRepository = pairingRepository;
  }
}
