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
public final class PairingScannerActivity_MembersInjector implements MembersInjector<PairingScannerActivity> {
  private final Provider<PairingRepository> pairingRepositoryProvider;

  public PairingScannerActivity_MembersInjector(
      Provider<PairingRepository> pairingRepositoryProvider) {
    this.pairingRepositoryProvider = pairingRepositoryProvider;
  }

  public static MembersInjector<PairingScannerActivity> create(
      Provider<PairingRepository> pairingRepositoryProvider) {
    return new PairingScannerActivity_MembersInjector(pairingRepositoryProvider);
  }

  @Override
  public void injectMembers(PairingScannerActivity instance) {
    injectPairingRepository(instance, pairingRepositoryProvider.get());
  }

  @InjectedFieldSignature("com.pinbridge.otpmirror.PairingScannerActivity.pairingRepository")
  public static void injectPairingRepository(PairingScannerActivity instance,
      PairingRepository pairingRepository) {
    instance.pairingRepository = pairingRepository;
  }
}
