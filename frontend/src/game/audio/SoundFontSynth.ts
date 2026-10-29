import { WorkletSynthesizer } from "spessasynth_lib";

/** spessasynth_lib 4.4.0/core 4.4.2 emit channel reset parameters before channelAdded.
 * Reserve the public channel state before requesting its processor counterpart;
 * consume the later acknowledgement instead of adding a duplicate channel.
 * Keep this workaround here until upstream channel initialization is ordered safely.
 */
export class SoundFontSynth extends WorkletSynthesizer {
  private pendingChannels = 0;

  override addNewChannel() {
    super.addNewChannelInternal();
    this.pendingChannels++;
    super.addNewChannel();
  }

  protected override addNewChannelInternal() {
    // The base constructor also calls this method, before field initializers run.
    if (this.pendingChannels > 0) this.pendingChannels--;
    else super.addNewChannelInternal();
  }
}
